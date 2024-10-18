import { redis } from ".";
import { LeaderboardPlayer, RiotRequestManager } from "./lib";

const PAGE_SIZE = 200;

async function fetchLeaderboardPage(page: number, region: string, platform: 'pc' | 'console') {
  try {
    const response = await fetch(
      `https://${region}.api.riotgames.com/val/${platform === 'console' ? 'console/' : ''}ranked/v1/leaderboards/by-act/292f58db-4c17-89a7-b1c0-ba988f0e9d98?size=200&startIndex=${
        (page - 1) * 200
      }&platformType=playstation`,
      {
        headers: {
          "X-Riot-Token": process.env.RIOT_API_KEY!,
        },
      }
    );

    const rateLimitHeader =
      response.headers.get("X-Method-Rate-Limit-Count") ||
      response.headers.get("x-method-rate-limit-count");
    const [requestsUsed, limit] = rateLimitHeader
      ? rateLimitHeader.split(":").map(Number)
      : [0, 10];
    const rateLimitInfo = { requestsUsed, limit };

    const data = await response.json();
    redis.set(`leaderboard:${platform}:${region}:thresholds`, JSON.stringify(data.tierDetails));
    return { data: data.players, rateLimitInfo };
  } catch (error) {
    return null;
  }
}

async function handleRateLimit(rateLimitInfo: { requestsUsed: number; limit: number }) {
  const { requestsUsed, limit } = rateLimitInfo;
  const remainingRequests = limit - requestsUsed;

  if (remainingRequests <= 0) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}

export async function processLeaderboard(region: string, platform: 'pc' | 'console') {

  const actId = await RiotRequestManager.getActId(region);

  const accTable = [];
  let currentPage = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    for (let i = 0; i < 10 && hasMorePages; i++) {
      const result = await fetchLeaderboardPage(currentPage, region, platform).catch(
        () => null
      );
      if (!result?.data) {
        hasMorePages = false;
        currentPage = 1;
        break;
      }
      if (result && result.data) {
        const pageData = result.data;
        if (pageData.length < PAGE_SIZE) {
          hasMorePages = false;
        }

        accTable.push(...pageData);

        await handleRateLimit(result.rateLimitInfo);
        await saveLeaderboardToRedis(currentPage, pageData, region, platform);
        currentPage++;
      }

      if (result.data.length < 200) {
        hasMorePages = false;
        currentPage = 1;
      }
    }
  }

  await saveFinalLeaderboardToRedis(accTable, region, platform);
}

async function saveLeaderboardToRedis(page: number, pageData: LeaderboardPlayer[], region: string, platform: 'pc' | 'console') {
  const pageKey = `leaderboard:${platform}:${region}:pages:${page}`;
  try {
    await redis.set(pageKey, JSON.stringify(pageData));
  } catch (error) {
    throw new Error(`Error caching leaderboard page ${page}: ${error}`);
  }
}

async function saveFinalLeaderboardToRedis(leaderboardArray: LeaderboardPlayer[], region: string, platform: 'pc' | 'console') {
  try {
    await redis.set(
      `leaderboard:${platform}:${region}:total`,
      JSON.stringify(leaderboardArray)
    );

    setTimeout(() => processLeaderboard(region, platform), 10000);
  } catch (error) {
    throw new Error(`Error caching final leaderboard: ${error}`);
  }
}
