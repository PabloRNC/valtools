package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/shirou/gopsutil/cpu"
	"github.com/shirou/gopsutil/mem"
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

const (
	pageSize       = 200
	redisKeyFormat = "leaderboard:%s:%s"
)

var (
	redisClient *redis.Client
	ctx         = context.Background()
	actId       = "dcde7346-4085-de4f-c463-2489ed47983b"
)

func init() {
	redisAddr := os.Getenv("REDIS_HOST")
	redisPass := os.Getenv("REDIS_PASS")
	redisDB, _ := strconv.Atoi(os.Getenv("REDIS_DB"))

	if redisAddr == "" {
		redisAddr = "localhost:6379" // Default host si no se proporciona
	}
	if redisPass == "" {
		redisPass = "" // Default sin contraseña
	}

	redisClient = redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: redisPass,
		DB:       redisDB,
	})
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
			return fetchLeaderboardPage(actId, page, region, platform) // Recursión para volver a intentar después de la espera
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

func savePlayersToRedis(players []Player, region, platform string, page int) error {
	key := fmt.Sprintf("leaderboard:%s:%s:page:%d", platform, region, page)
	redisClient.Del(ctx, key)
	pipeline := redisClient.Pipeline()

	for _, player := range players {
		data, _ := json.Marshal(player)
		pipeline.RPush(ctx, key, string(data))
	}

	_, err := pipeline.Exec(ctx)
	return err
}

func processLeaderboardForRegion(actId, region, platform string) {
	for {
		page := 1
		for {
			players, err := fetchLeaderboardPage(actId, page, region, platform)
			if err != nil {
				fmt.Printf("Error fetching page %d for %s (%s): %v\n", page, platform, region, err)
				return
			}

			if len(players.Players) == 0 {
				fmt.Println("No more players found. Exiting...")
				break
			}

			fmt.Printf("Page %d fetched for %s (%s) - Players: %d\n", page, platform, region, len(players.Players))

			err = savePlayersToRedis(players.Players, region, platform, page)
			if err != nil {
				fmt.Printf("Error saving page %d for %s (%s): %v\n", page, platform, region, err)
			}

			page++
		}
		fmt.Printf("Processing complete for %s (%s). Restarting after 2 minutes...\n", platform, region)
		time.Sleep(2 * time.Minute) // Esperar 2 minutos antes de volver a ejecutar
	}
}

func printSystemStats() {
	vmStat, _ := mem.VirtualMemory()
	cpuStat, _ := cpu.Percent(0, false)

	fmt.Printf("\nSystem Stats:\n")
	fmt.Printf("Memory Usage: %.2f%%\n", vmStat.UsedPercent)
	fmt.Printf("CPU Usage: %.2f%%\n", cpuStat[0])
}

func processAllRegions() {
	pcRegions := []string{"na", "eu", "ap", "kr", "br", "latam"}
	consoleRegions := []string{"na", "eu", "ap"}

	// Procesar regiones para PC
	for _, region := range pcRegions {
		go processLeaderboardForRegion(actId, region, "pc")
	}

	// Procesar regiones para Console
	for _, region := range consoleRegions {
		go processLeaderboardForRegion(actId, region, "console")
	}

	// Esperar a que todos los procesos terminen
	time.Sleep(10 * time.Minute) // Ajustar según el tiempo esperado para que los procesos terminen
}

func main() {
	processAllRegions()
	printSystemStats()
	fmt.Println("All leaderboards processed.")
}
