package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
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

type Season struct {
	UUID        string  `json:"uuid"`
	DisplayName string  `json:"displayName"`
	Title       *string `json:"title"`
	Type        *string `json:"type"`
	StartTime   string  `json:"startTime"`
	EndTime     string  `json:"endTime"`
	ParentUuid  *string `json:"parentUuid"`
	AssetPath   string  `json:"assetPath"`
}

type LeaderboardResponse struct {
	Players      []Player               `json:"players"`
	TotalPlayers int                    `json:"totalPlayers"`
	TierDetails  map[string]interface{} `json:"tierDetails"`
}

type SeasonResponse struct {
	Data []Season `json:"data"`
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

func fetchLeaderboardPage(actId string, page int, region, platform string) (*LeaderboardResponse, int, error) {
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
		log.Printf("[ERROR] Fetching leaderboard page (region=%s, platform=%s, page=%d): %v", region, platform, page, err)
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 && resp.StatusCode != 404 && resp.StatusCode != 429 {
		log.Printf("[WARN] Unexpected status code %d from leaderboard API (region=%s, platform=%s, page=%d)", resp.StatusCode, region, platform, page)
	}

	if resp.StatusCode == 404 {
		return nil, 404, nil
	}

	if resp.StatusCode == 400 {
		return nil, 400, nil
	}

	if resp.StatusCode == 429 {
		retryAfter := resp.Header.Get("Retry-After")
		log.Printf("[INFO] Rate limited by Riot API (region=%s, platform=%s, page=%d), retry-after: %s", region, platform, page, retryAfter)
		if retryAfter != "" {
			waitTime, _ := strconv.Atoi(retryAfter)
			time.Sleep(time.Duration(waitTime) * time.Second)
			return fetchLeaderboardPage(actId, page, region, platform)
		}
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[ERROR] Reading response body for leaderboard page (region=%s, platform=%s, page=%d): %v", region, platform, page, err)
		return nil, resp.StatusCode, err
	}

	var data LeaderboardResponse
	err = json.Unmarshal(body, &data)
	if err != nil {
		log.Printf("[ERROR] Unmarshaling leaderboard response (region=%s, platform=%s, page=%d): %v", region, platform, page, err)
		return nil, resp.StatusCode, err
	}

	return &data, resp.StatusCode, nil
}

func fetchSeasonData() ([]Season, error) {
	url := "https://valorant-api.com/v1/seasons"
	client := &http.Client{}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		log.Printf("[ERROR] Creating request for season data: %v", err)
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[ERROR] Fetching season data: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("[WARN] Unexpected status code %d from season API", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[ERROR] Reading season response body: %v", err)
		return nil, err
	}

	var data SeasonResponse
	err = json.Unmarshal(body, &data)
	if err != nil {
		log.Printf("[ERROR] Unmarshaling season data: %v", err)
		return nil, err
	}

	return data.Data, nil
}

func getActIDs() (string, string) {
	for {
		seasons, err := fetchSeasonData()
		if err != nil {
			time.Sleep(30 * time.Second)
			continue
		}

		now := time.Now()
		var activeSeason *Season
		var latestEnded *Season

		for _, season := range seasons {
			if season.ParentUuid == nil {
				continue
			}
			startTime, err1 := time.Parse(time.RFC3339, season.StartTime)
			endTime, err2 := time.Parse(time.RFC3339, season.EndTime)
			if err1 != nil || err2 != nil {
				continue
			}
			if now.After(startTime) && now.Before(endTime) {
				activeSeason = &season
			} else if endTime.Before(now) {
				if latestEnded == nil || endTime.After(parseTime(latestEnded.EndTime)) {
					latestEnded = &season
				}
			}
		}

		if activeSeason != nil && latestEnded != nil {
			return activeSeason.UUID, latestEnded.UUID
		}
		time.Sleep(30 * time.Second)
	}
}

func parseTime(ts string) time.Time {
	t, _ := time.Parse(time.RFC3339, ts)
	return t
}

func saveAndConcatenatePagesToRedis(region, platform string, actId string) {
	page := 1
	totalKey := fmt.Sprintf("leaderboard:%s:%s:total", platform, region)
	playerKey := fmt.Sprintf("leaderboard:%s:%s:players", platform, region)
	thresholdsKey := fmt.Sprintf("leaderboard:%s:%s:thresholds", platform, region)

	var allPageKeys []string
	var thresholds map[string]interface{} = make(map[string]interface{})

	for {
		playersPage, status, err := fetchLeaderboardPage(actId, page, region, platform)

		if err != nil {
			log.Printf("[ERROR] Fetching page %d for %s-%s: %v", page, platform, region, err)
			return
		}

		if status == 404 {
			log.Printf("[INFO] No leaderboard found for %s-%s (actId=%s), stopping.", platform, region, actId)
			break
		}

		if status == 400 {
			log.Printf("[WARN] Received 400 from API on page %d for %s-%s. Stopping pagination early and saving what we have.", page, platform, region)
			break
		}

		if page == 1 {
			thresholds = playersPage.TierDetails
		}

		if len(playersPage.Players) == 0 {
			log.Printf("[INFO] Page %d empty for %s-%s, stopping.", page, platform, region)
			thresholdsData, _ := json.Marshal(thresholds)
			err := redisClient.Set(ctx, thresholdsKey, string(thresholdsData), 0).Err()
			if err != nil {
				log.Printf("[ERROR] Saving thresholds to Redis for %s-%s: %v", platform, region, err)
			}
			break
		}

		pageKey := fmt.Sprintf("leaderboard:%s:%s:page:%d", platform, region, page)
		playersData, _ := json.Marshal(playersPage.Players)
		err = redisClient.Set(ctx, pageKey, playersData, 0).Err()
		if err != nil {
			log.Printf("[ERROR] Saving page %d to Redis for %s-%s: %v", page, platform, region, err)
			return
		}

		log.Printf("[INFO] Saved page %d for %s-%s with %d players.", page, platform, region, len(playersPage.Players))
		allPageKeys = append(allPageKeys, pageKey)

		lastPlayer := playersPage.Players[len(playersPage.Players)-1]
		if lastPlayer.LeaderboardRank == playersPage.TotalPlayers {
			log.Printf("[INFO] Last player rank %d equals totalPlayers (%d) for %s-%s. Pagination complete.", lastPlayer.LeaderboardRank, playersPage.TotalPlayers, platform, region)
			break
		}

		page++
	}

	luaScript := `
		local totalKey = KEYS[1]
		local playerKey = KEYS[2]
		local pageKeys = ARGV
		local result = {}

		local cursor = "0"
		local pattern = playerKey .. ":*"
		repeat
			local scanResult = redis.call("SCAN", cursor, "MATCH", pattern, "COUNT", 100)
			cursor = scanResult[1]
			local keys = scanResult[2]
			if #keys > 0 then
				redis.call("DEL", unpack(keys))
			end
		until cursor == "0"

		for _, key in ipairs(pageKeys) do
			local value = redis.call("GET", key)
			if value then
				local pageData = cjson.decode(value)
				for i = 1, #pageData do
					local playerData = pageData[i]
					local playerDataKey = playerKey..":"..playerData.leaderboardRank.."_"..playerData.puuid
					redis.call("SET", playerDataKey, cjson.encode(playerData))
					table.insert(result, playerData)
				end
			end
		end

		redis.call("SET", totalKey, cjson.encode(result))
		return #result
	`

	_, err := redisClient.Eval(ctx, luaScript, []string{totalKey, playerKey}, allPageKeys).Result()
	if err != nil {
		log.Printf("[ERROR] Executing Lua script for %s-%s: %v", platform, region, err)
		return
	}

	for _, pageKey := range allPageKeys {
		redisClient.Del(ctx, pageKey)
	}
	log.Printf("[INFO] Successfully saved %d pages for %s-%s.", len(allPageKeys), platform, region)
}

func processRegion(region, platform string, timeout time.Duration) {
	for {
		activeActId, fallbackActId := getActIDs()
		_, status, err := fetchLeaderboardPage(activeActId, 1, region, platform)
		if err != nil {
			log.Printf("[ERROR] Fetching first page for %s-%s: %v", platform, region, err)
		}
		if status == 404 {
			saveAndConcatenatePagesToRedis(region, platform, fallbackActId)
		} else {
			saveAndConcatenatePagesToRedis(region, platform, activeActId)
		}
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
