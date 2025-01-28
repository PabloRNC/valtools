import { DateTime } from "luxon";
import { redis } from "..";
import { RiotRequestManager } from "./RiotRequestManager";
import type { BaseMatch, RedisDaily, RedisMatchlist, RiotGetMatchResponse } from "./types";

const regionTimeZones = {
  ap: "Asia/Tokyo",
  br: "America/Sao_Paulo",
  eu: "Europe/Berlin",
  kr: "Asia/Seoul",
  latam: "America/Mexico_City",
  na: "America/New_York",
};

export async function getLastMatchId(
  puuid: string,
  platform: "pc" | "console"
) {
  const redisMatchlist = await redis.get(
    getKey("matchlist:last", puuid, platform)
  );

  return redisMatchlist ?? false;

}

export async function setLastMatchId(puuid: string, platform: "pc" | "console", matchId: string) {
    await redis.set(
        getKey("matchlist:last", puuid, platform),
        matchId,
        "EX",
        3600 * 24 * 7 * 4
    );
    }

export async function addMatches(
  puuid: string,
  platform: "pc" | "console",
  competitive: boolean,
  matches: RedisMatchlist[]
) {
  const key = await redis.get(
    getKey(matchlistKey(competitive), puuid, platform)
  );

  if (!key) {
    await redis.set(
      getKey(matchlistKey(competitive), puuid, platform),
      JSON.stringify(matches),
      "EX",
      3600 * 24 * 7 * 4
    );
    return matches;
  }

  const matchlist = JSON.parse(key) as RedisMatchlist[];

  const newMatchlist = matches.concat(matchlist.slice(0, 3 - matches.length));

  await redis.set(
    getKey(matchlistKey(competitive), puuid, platform),
    JSON.stringify(newMatchlist),
    "EX",
    3600 * 24 * 7 * 4
  );

  return newMatchlist;
}

export async function parseMatches(
  puuid: string,
  region: string,
  platform: "pc" | "console",
  matches: BaseMatch[]
) {
  const accData = [];

  for (const match of matches) {
    const matchData = await RiotRequestManager.getMatch(
      match.matchId,
      region,
      platform
    );

    const parsedMatch = parseMatch(puuid, platform, matchData);

    accData.push(parsedMatch);
  }

  return accData.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()) as RedisMatchlist[];
}

export async function getDaily(
  puuid: string,
  region: string,
  platform: "pc" | "console",
  matches: BaseMatch[],
  onlyCompetitive: boolean
) {

  const cachedDaily = await redis.get(getKey("daily", puuid, platform));

  const nowInRegion = DateTime.now()
    .setZone(regionTimeZones[region as keyof typeof regionTimeZones])
    .startOf("day");

  const toUseMatches = matches.filter((x) => {
    if(x.queueId === "") return false
    if(onlyCompetitive && x.queueId !== parseQueue("competitive", platform)) return false
    return nowInRegion.equals(
      DateTime.fromMillis(x.gameStartTimeMillis)
        .setZone(regionTimeZones[region as keyof typeof regionTimeZones])
        .startOf("day")
    )
    }).sort((a, b) => b.gameStartTimeMillis - a.gameStartTimeMillis);

  const obj = {
        won: 0,
        lost: 0,
        streak: 0,
        status: {}
    };

  for (const match of toUseMatches.reverse()) {

    if(cachedDaily){

        const parsedData = JSON.parse(cachedDaily) as RedisDaily;

        const status = parsedData.status[match.matchId];

        if(typeof status === 'boolean'){
            obj.won += status ? 1 : 0;
            obj.lost += status ? 0 : 1;
            obj.streak = status ? obj.streak + 1 : 0;
            //@ts-ignore
            obj.status[match.matchId] = status;
            continue;
        } else if(status === 'tied'){
            //@ts-ignore
            obj.status[match.matchId] = 'tied';
            continue;
        }

    }

    const matchData = await RiotRequestManager.getMatch(
      match.matchId,
      region,
      platform
    );

    const player = matchData.players.find((x) => x.puuid === puuid)!;

    const team = matchData.teams.find((x) => x.teamId === player.teamId)!;

    if (team.won) {
      obj.won++;
      obj.streak++;
      //@ts-ignore
      obj.status[match.matchId] = true;
    } else {
      if (
        matchData.teams.reduce((acc: boolean, x) => {
          if (!acc) return acc;
          if (x.won) acc = false;
          return acc;
        }, true)
      ) {
        //@ts-ignore
        obj.status[match.matchId] = 'tied';
        continue;
      }

      //@ts-ignore
      obj.status[match.matchId] = false;
      obj.streak = 0;
      obj.lost++;
    }
  }

  const nowUTC = new Date().getTime();
  const expiryTimeUTC = new Date(
    nowInRegion.plus({ days: 1 }).toISO()!
  ).getTime();

  const ttlMs = Math.max(0, expiryTimeUTC - nowUTC);

  await redis.set(
    getKey("daily", puuid, platform),
    JSON.stringify(obj),
    "PX",
    ttlMs
  );

  return obj;
}

export async function getPlayer(data: RedisMatchlist, platform: "pc" | "console") {

  const player = {
    puuid: data.puuid,
    username: data.username,
    tagLine: data.tagLine,
    accountLevel: data.accountLevel,
    playerCard: data.playerCard,
    platform
  };

  await redis.set(getKey("player", data.puuid, platform), JSON.stringify(player), "EX", 3600 * 24 * 7 * 4);

  return player;
}

export function parseMatch(puuid: string, platform: 'pc' | 'console', matchData: RiotGetMatchResponse){

  const player = matchData.players.find((x) => x.puuid === puuid)!;

    const isDeathmatch =
      matchData.matchInfo.queueId === parseQueue("deathmatch", platform) ||
      matchData.matchInfo.gameMode ===
        "/Game/GameModes/Deathmatch/DeathmatchGameMode.DeathmatchGameMode_C";

    const team = matchData.teams.find((x) => x.teamId === player.teamId)!;

    const otherTeam = matchData.teams.find((x) => x.teamId !== player.teamId)!;

    const score = isDeathmatch
      ? player.stats.kills.toString()
      : matchData.matchInfo.queueId === parseQueue("hurm", platform) ||
        (matchData.matchInfo.queueId === "" && matchData.matchInfo.gameMode.includes("HURM"))
      ? `${team.numPoints} - ${otherTeam.numPoints}`
      : `${team.roundsWon} - ${team.roundsPlayed - team.roundsWon}`;

    const damage = matchData.roundResults.reduce(
      (acc: { headshots: number; bodyshots: number; legshots: number }, x) => {
        const pStats = x.playerStats.find((_) => _.puuid === puuid)!;
        for (const d of pStats.damage) {
          acc.headshots += d.headshots;
          acc.bodyshots += d.bodyshots;
          acc.legshots += d.legshots;
        }
        return acc;
      },
      { headshots: 0, bodyshots: 0, legshots: 0 }
    );

    const shots = damage.headshots + damage.bodyshots + damage.legshots;

    const allScores = matchData.players.sort(
      (a, b) => (b.stats?.score || 0) - (a.stats?.score || 0)
    );

    const drawn = matchData.teams.reduce((acc: boolean, x) => {
      if (!acc) return acc;
      if (x.won) acc = false;
      return acc;
    }, true);

    return {
      startedAt: new Date(matchData.matchInfo.gameStartMillis),
      id: matchData.matchInfo.matchId,
      agentId: player.characterId,
      mapId: matchData.matchInfo.mapId,
      mode: matchData.matchInfo.gameMode,
      isDeathmatch,
      score,
      kills: player.stats.kills,
      deaths: player.stats.deaths,
      assists: player.stats.assists,
      headshots: !isDeathmatch ? (damage.headshots / shots).toFixed(2) : "0",
      bodyshots: !isDeathmatch ? (damage.bodyshots / shots).toFixed(2) : "0",
      legshots: !isDeathmatch ? (damage.legshots / shots).toFixed(2) : "0",
      won: team.won,
      drawn,
      acs: Math.round(player.stats.score / player.stats.roundsPlayed),
      mvp: isDeathmatch ? false : allScores[0].puuid === puuid,
      competitiveTier: player.competitiveTier,
      seasonId: matchData.matchInfo.seasonId,
      timestamp: new Date(matchData.matchInfo.gameStartMillis),
      teamMvp: isDeathmatch
        ? false
        : allScores.filter((x) => x.teamId === team.teamId)[0].puuid === puuid,
      puuid: player.puuid,
      playerCard: player.playerCard,
      tagLine: player.tagLine,
      username: player.gameName,
      accountLevel: player.accountLevel,
      queueId:
        matchData.matchInfo.queueId === ""
          ? "custom"
          : normalizeQueue(matchData.matchInfo.queueId, platform),
    };
}

export async function getMMR(
  puuid: string,
  region: string,
  platform: "pc" | "console",
  lastCompetitive?: RedisMatchlist
) {
  const key = await redis.get(getKey("mmr", puuid, platform));

  if (!key) {

    const actId = await redis.get("actId");

    if (
      lastCompetitive?.seasonId !== actId ||
      lastCompetitive.competitiveTier < 24
    ) {
      const mmr = {
        tier:
          lastCompetitive?.seasonId !== actId
            ? 0
            : lastCompetitive.competitiveTier,
        rr: null,
        leaderboard_rank: null,
        threshold: null,
      };

      await redis.set(getKey("mmr", puuid, platform), JSON.stringify(mmr));

      return mmr;
    } else {
      const thresholds = JSON.parse(
        (await redis.get(
          `leaderboard:${platform}:${region}:thresholds`
        )) as string
      );

      const redisKeys = await findKeysById(
        `leaderboard:${platform}:${region}:players:*_${puuid}`
      );

      if (!redisKeys.length)
        return {
          tier: lastCompetitive.competitiveTier,
          rr: null,
          leaderboard_rank: null,
          threshold: null,
        };

      const leaderboardData = JSON.parse(
        (await redis.get(redisKeys[0])) as string
      );

      let threshold =
        thresholds[leaderboardData.competitiveTier + 1]?.rankedRatingThreshold;

      if (leaderboardData.competitiveTier === 26) {
        const thresholdKeys = await findKeysById(
          `leaderboard:${platform}:${region}:players:${
            thresholds["26"].startingIndex - 1
          }_*`
        );
        if (thresholdKeys.length) {
          threshold =
            JSON.parse((await redis.get(thresholdKeys[0])) as string)
              .rankedRating + 1;
        }
      } else {
        if (!threshold) threshold = null;
      }

      const mmr = {
        tier: leaderboardData.competitiveTier,
        rr: leaderboardData.rankedRating,
        leaderboard_rank: leaderboardData.leaderboardRank,
        threshold,
      };

      await redis.set(getKey("mmr", puuid, platform), JSON.stringify(mmr));

      return mmr;
    }
  }

  return JSON.parse(key);
}

export async function useCache(puuid: string, platform: "pc" | "console") {
  return !!(await redis.get(getKey("cache", puuid, platform)));
}

export async function setCache(
  puuid: string,
  platform: "pc" | "console",
  seconds: number
) {
  console.log('saved cache')
  await redis.set(getKey("cache", puuid, platform), "true", "EX", seconds);
}

export function matchlistKey(competitive: boolean) {
  return `matchlist:${competitive ? "ranked" : "unrated"}`;
}

export function normalizeQueue(queue: string, platform: string) {
  return queue.replace(`${platform}_`, "");
}

export function parseQueue(queue: string, platform: string) {
  return `${platform === "console" ? "console_" : ""}${queue}`;
}

export function parseKey(key: string, platform: string) {
  return `${platform}_${key}`;
}

export function getKey(key: string, puuid: string, platform: string) {
  return `${parseKey(key, platform)}:${puuid}`;
}

async function findKeysById(pattern: string) {
  const keys = [];
  let cursor = "0";

  do {
    const [nextCursor, matches] = await redis.scan(cursor, "MATCH", pattern);
    cursor = nextCursor;
    keys.push(...matches);
  } while (cursor !== "0");

  return keys;
}
