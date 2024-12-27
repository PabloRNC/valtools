package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type Player struct {
	Name            string `json:"gameName"`
	TagLine         string `json:"tagLine"`
	LeaderboardRank int    `json:"leaderboardRank"`
	RankedRating    int    `json:"rankedRating"`
	NumberOfWins    int    `json:"numberOfWins"`
	CompetitiveTier int    `json:"competitiveTier"`
	Puuid           string `json:"puuid"`
}

type LeaderboardResponse struct {
	Players      []Player               `json:"players"`
	TotalPlayers int                    `json:"totalPlayers"`
	TierDetails  map[string]interface{} `json:"tierDetails"`
}

type Act struct {
	ID       string `json:"id"`
	IsActive bool   `json:"isActive"`
}

const (
	pageSize = 200
)

var (
	redisClient  *redis.Client
	ctx          = context.Background()
	wg           sync.WaitGroup
	queueChannel chan func()
)

func redisWorker() {
	for task := range queueChannel {
		task()
	}
}

func init() {
	redisAddr := os.Getenv("REDIS_HOST")
	redisPass := os.Getenv("REDIS_PASS")
	redisDB, _ := strconv.Atoi(os.Getenv("REDIS_DB"))

	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	if redisPass == "" {
		redisPass = ""
	}

	redisClient = redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: redisPass,
		DB:       redisDB,
	})
	queueChannel = make(chan func(), 100)
	go redisWorker()
}

func fetchLeaderboardPage(actId string, page int, region, platform string) (*LeaderboardResponse, error) {
	url := fmt.Sprintf("https://%s.api.riotgames.com/val/%sranked/v1/leaderboards/by-act/%s?size=%d&startIndex=%d&platformType=playstation",
		region,
		map[string]string{"console": "console/", "pc": ""}[platform],
		actId,
		pageSize,
		(page-1)*pageSize,
	)

	client := &http.Client{}
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Add("X-Riot-Token", os.Getenv("RIOT_API_KEY"))

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		retryAfter := resp.Header.Get("Retry-After")
		if retryAfter != "" {
			waitTime, _ := strconv.Atoi(retryAfter)
			fmt.Printf("Rate limit reached for %s (%s). Waiting for %d seconds...\n", platform, region, waitTime)
			time.Sleep(time.Duration(waitTime) * time.Second)
			return fetchLeaderboardPage(actId, page, region, platform)
		}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var data LeaderboardResponse
	err = json.Unmarshal(body, &data)
	if err != nil {
		return nil, err
	}

	return &data, nil
}

func fetchActiveActID(region string) string {
	for {
		url := fmt.Sprintf("https://%s.api.riotgames.com/val/content/v1/contents", region)
		client := &http.Client{}
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Add("X-Riot-Token", os.Getenv("RIOT_API_KEY"))

		resp, err := client.Do(req)
		if err != nil {
			fmt.Printf("Error fetching active actId for %s: %v. Retrying in 30 seconds...\n", region, err)
			time.Sleep(30 * time.Second)
			continue
		}

		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			fmt.Printf("Error reading response body for %s: %v. Retrying in 30 seconds...\n", region, err)
			time.Sleep(30 * time.Second)
			continue
		}

		var content struct {
			Acts []Act `json:"acts"`
		}

		err = json.Unmarshal(body, &content)
		if err != nil {
			fmt.Printf("Error unmarshaling JSON for %s: %v. Retrying in 30 seconds...\n", region, err)
			time.Sleep(30 * time.Second)
			continue
		}

		for _, act := range content.Acts {
			if act.IsActive {
				return act.ID
			}
		}

		fmt.Printf("No active act found for %s. Retrying in 30 seconds...\n", region)
		time.Sleep(30 * time.Second)
	}
}

func saveAndConcatenatePagesToRedis(region, platform string, actId string) {
	page := 1
	totalKey := fmt.Sprintf("leaderboard:%s:%s:total", platform, region)
	thresholdsKey := fmt.Sprintf("leaderboard:%s:%s:thresholds", platform, region)

	var allPageKeys []string

	for {
		playersPage, err := fetchLeaderboardPage(actId, page, region, platform)
		if err != nil {
			fmt.Printf("Error fetching page %d for %s (%s): %v\n", page, platform, region, err)
			return
		}

		if len(playersPage.Players) == 0 {
			redisClient.Set(ctx, thresholdsKey, playersPage.TierDetails, 0)
			fmt.Printf("Saved threshold for %s (%s)\n", platform, region)
			break
		}

		pageKey := fmt.Sprintf("leaderboard:%s:%s:page:%d", platform, region, page)
		playersData, _ := json.Marshal(playersPage.Players)
		err = redisClient.Set(ctx, pageKey, playersData, 0).Err()
		if err != nil {
			fmt.Printf("Error saving page %d to Redis for %s (%s): %v\n", page, platform, region, err)
			return
		}

		fmt.Printf("Saved page for %s (%s): %d\n", platform, region, page)

		allPageKeys = append(allPageKeys, pageKey)

		page++
	}

	luaScript := `
		local totalKey = KEYS[1]
local pageKeys = ARGV
local result = {}

for _, key in ipairs(pageKeys) do
    local value = redis.call("GET", key)
    if value then
        local pageData = cjson.decode(value)
        for _, item in ipairs(pageData) do
            table.insert(result, item)
        end
    end
end

redis.call("SET", totalKey, cjson.encode(result))
return #result
	`

	_, err := redisClient.Eval(ctx, luaScript, []string{totalKey}, allPageKeys).Result()
	if err != nil {
		fmt.Printf("Error concatenating pages to Redis for %s (%s): %v\n", platform, region, err)
		return
	}

	fmt.Printf("All pages concatenated and saved to %s\n", totalKey)

	for _, pageKey := range allPageKeys {
		err := redisClient.Del(ctx, pageKey).Err()
		if err != nil {
			fmt.Printf("Error deleting temporary page %s: %v\n", pageKey, err)
		}
	}

	fmt.Printf("All temporary pages deleted\n")
}

func processRegion(region, platform string, timeout time.Duration) {
	for {
		actId := fetchActiveActID(region)
		saveAndConcatenatePagesToRedis(region, platform, actId)
		time.Sleep(timeout)
	}
}

func main() {
	pcRegions := []string{"na", "eu", "ap", "kr", "br", "latam"}
	consoleRegions := []string{"na", "eu", "ap"}

	timeoutMap := map[string]time.Duration{
		"na":    2 * time.Minute,
		"eu":    2 * time.Minute,
		"ap":    2 * time.Minute,
		"kr":    2 * time.Minute,
		"br":    2 * time.Minute,
		"latam": 2 * time.Minute,
	}

	for _, region := range pcRegions {
		wg.Add(1)
		go func(region string) {
			defer wg.Done()
			processRegion(region, "pc", timeoutMap[region])
		}(region)
	}

	for _, region := range consoleRegions {
		wg.Add(1)
		go func(region string) {
			defer wg.Done()
			processRegion(region, "console", timeoutMap[region])
		}(region)
	}

	wg.Wait()
}
