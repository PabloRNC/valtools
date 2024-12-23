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
	allDataMap   = make(map[string]map[string]interface{})
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

func savePlayersAndTierDetailsToRedis(region, platform string) error {
	keyPlayers := fmt.Sprintf("leaderboard:%s:%s:total", platform, region)
	keyTierDetails := fmt.Sprintf("leaderboard:%s:%s:thresholds", platform, region)

	allData := allDataMap[fmt.Sprintf("%s.%s", platform, region)]
	playersData, _ := json.Marshal(allData["players"])
	tierDetailsData, _ := json.Marshal(allData["tierDetails"])

	queueChannel <- func() {
		_ = redisClient.Del(ctx, keyPlayers, keyTierDetails).Err()
		_ = redisClient.Set(ctx, keyPlayers, playersData, 0).Err()
		_ = redisClient.Set(ctx, keyTierDetails, tierDetailsData, 0).Err()
	}

	return nil
}

func processLeaderboardForRegion(actId, region, platform string) {
	defer wg.Done()

	allDataMapKey := fmt.Sprintf("%s.%s", platform, region)

	allDataMap[allDataMapKey] = map[string]interface{}{
		"tierDetails": map[string]interface{}{},
		"players":     []Player{},
	}

	for {
		page := 1
		for {
			playersPage, err := fetchLeaderboardPage(actId, page, region, platform)
			if err != nil {
				fmt.Printf("Error fetching page %d for %s (%s): %v\n", page, platform, region, err)
				return
			}

			if len(playersPage.Players) == 0 {
				_ = savePlayersAndTierDetailsToRedis(region, platform)
				fmt.Println("All players and tier details saved to Redis.")
				time.Sleep(2 * time.Minute)
				break
			}

			allDataMap[allDataMapKey]["players"] = append(allDataMap[allDataMapKey]["players"].([]Player), playersPage.Players...)
			allDataMap[allDataMapKey]["tierDetails"] = playersPage.TierDetails

			fmt.Printf("Page %d fetched for %s (%s) - Players: %d\n", page, platform, region, len(playersPage.Players))
			page++
		}
	}
}

func processAllRegions() {
	pcRegions := []string{"na", "eu", "ap", "kr", "br", "latam"}
	consoleRegions := []string{"na", "eu", "ap"}

	for {
		for _, region := range pcRegions {
			wg.Add(1)
			go func(region string) {
				actId := fetchActiveActID(region)
				processLeaderboardForRegion(actId, region, "pc")
			}(region)
		}

		for _, region := range consoleRegions {
			wg.Add(1)
			go func(region string) {
				actId := fetchActiveActID(region)
				processLeaderboardForRegion(actId, region, "console")
			}(region)
		}

		wg.Wait()
	}
}

func main() {
	processAllRegions()
}
