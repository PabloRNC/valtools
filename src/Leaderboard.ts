import { redis } from ".";
import { LeaderboardPlayer, RiotRequestManager } from "./lib";

const PAGE_SIZE = 200;

async function fetchLeaderboardPage(
  actId: string,
  page: number,
  region: string,
  platform: "pc" | "console"
) {
  try {
    const response = await fetch(
      `https://${region}.api.riotgames.com/val/${
        platform === "console" ? "console/" : ""
      }ranked/v1/leaderboards/by-act/${actId}?size=200&startIndex=${
        (page - 1) * 200
      }&platformType=playstation`,
      {
        headers: {
          "X-Riot-Token": process.env.RIOT_API_KEY!,
        },
      }
    );

    const rateLimit =
      response.headers.get("X-Method-Rate-Limit") ||
      response.headers.get("x-method-rate-limit");
    const rateLimitCount =
      response.headers.get("X-Method-Rate-Limit-Count") ||
      response.headers.get("x-method-rate-limit-count");
    const retryAfter = response.headers.get("retry-after");

    const rateLimitInfo = parseRateLimitHeaders(rateLimit, rateLimitCount);

    if (response.status === 429 && retryAfter) {
      console.log(
        `Rate limited on ${region} ${platform} leaderboard, waiting ${retryAfter}s...`
      );
      const waitTime = parseInt(retryAfter, 10) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      console.log("Retrying leaderboard fetch...");
      return fetchLeaderboardPage(actId, page, region, platform);
    }

    const data = await response.json();

    return { data: data.players, rateLimitInfo, count: data.totalPlayers, tierDetais: data.tierDetails };
  } catch (error) {
    return null;
  }
}

function parseRateLimitHeaders(
  rateLimit: string | null,
  rateLimitCount: string | null
) {
  const limits =
    rateLimit?.split(",").map((limit) => limit.split(":").map(Number)) || [];
  const usages =
    rateLimitCount?.split(",").map((count) => count.split(":").map(Number)) ||
    [];

  return limits.map(([limitRequests, limitSeconds], index) => {
    const [usedRequests] = usages[index] || [0];
    return { limitRequests, limitSeconds, usedRequests };
  });
}

async function handleRateLimit(
  rateLimitInfo: Array<{
    usedRequests: number;
    limitRequests: number;
    limitSeconds: number;
  }>
) {
  const exceeded = rateLimitInfo.some(
    ({ usedRequests, limitRequests }) => usedRequests >= limitRequests
  );

  if (exceeded) {
    const waitTime =
      Math.max(...rateLimitInfo.map(({ limitSeconds }) => limitSeconds)) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
}

export async function processLeaderboard(
  region: string,
  platform: "pc" | "console"
) {
  const actId = await RiotRequestManager.getActId(region).catch(() => null);

  if(!actId) processLeaderboard(region, platform);

  const accTable = [];
  let currentPage = 1;
  let hasMorePages = true;
  let thresholds = {};

  while (hasMorePages) {
    for (let i = 0; i < 10 && hasMorePages; i++) {
      const result = await fetchLeaderboardPage(
        actId!,
        currentPage,
        region,
        platform
      ).catch(() => null);
      if (!result?.data) {
        hasMorePages = false;
        currentPage = 1;
        break;
      }

      thresholds = result.tierDetais;

      if (result && result.data) {
        const pageData = result.data;

        accTable.push(...pageData);

        await handleRateLimit(result.rateLimitInfo);
        currentPage++;

        if (
          result.data.length < PAGE_SIZE ||
          result.count <= result.data.pop().leaderboardRank
        ) {
          console.log("Leaderboard page size");
          hasMorePages = false;
          currentPage = 1;
          break;
        }
      }
      }

    await redis.set(
      `leaderboard:${platform}:${region}:thresholds`,
      JSON.stringify(thresholds)
    );

  }
  console.log(`Leaderboard for ${region} ${platform} has been processed.`);
  await saveFinalLeaderboardToRedis(accTable, thresholds, region, platform);
}

async function saveFinalLeaderboardToRedis(
  leaderboardArray: LeaderboardPlayer[],
  thresholds: {},
  region: string,
  platform: "pc" | "console",
) {
  try {
  
    await redis.set(
      `leaderboard:${platform}:${region}:thresholds`,
      JSON.stringify(thresholds)
    );

    await redis.set(
      `leaderboard:${platform}:${region}:total`,
      JSON.stringify(leaderboardArray)
    );

    setTimeout(() => processLeaderboard(region, platform), 30000);
  } catch (error) {
    throw new Error(`Error caching final leaderboard: ${error}`);
  }
}
