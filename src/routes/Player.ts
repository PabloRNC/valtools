import { Router } from "express";
import { User } from "../models";
import { redis } from "..";
import {
  RedisMatchlist,
  RiotRequestManager,
  RiotGetValorantContent,
  RiotGetMatchResponse,
  Redis,
  BaseMatch,
} from "../lib";

const router = Router();

router.get("/:channel_id", async (req, res) => {

  const { channel_id } = req.params;

  const user = await User.findOne({ channelId: channel_id });

  if (!user)
    return res.status(404).json({ status: 404, error: "User not found" });

  const { data: matchlist, cached } = await checkMatchlist(
    user.puuid,
    user.region,
    user.config.platform
  );

  if (!matchlist.data.length && !matchlist.competitiveMatches.length)
    return res
      .status(404)
      .json({ status: 404, error: "No match history found." });

  const mmr = await checkMMR(
    user.puuid,
    user.region,
    user.config.platform,
    matchlist.competitiveMatches,
    cached
  );

  const player = await checkPlayer(matchlist.data[0] || matchlist.competitiveMatches[0], user.config.platform);

  res.setHeader('Cache', `${cached ? 'HIT' : 'MISS'}`).json({
    matchlist: user.config.match_history ? matchlist.data : null,
    mmr,
    player,
    mmrHistory: user.config.match_history ? matchlist.competitiveMatches : null,
  });
});

export async function checkMatchlist(
  puuid: string,
  region: string,
  platform: "pc" | "console"
) {
  let data;

  try {
    data = await RiotRequestManager.getMatchlist(puuid, region, platform);
  } catch (e) {
    return {
      data: {
        data: [],
        competitiveMatches: [],
      },
      cached: false,
    };
  }

  const cache = await redis.get(parseKey(`matchlist:${puuid}`, platform));

  if(cache){
    const parsedCache = JSON.parse(cache) as Redis<{
      data: RedisMatchlist[];
      competitiveMatches: RedisMatchlist[];
    }>;

    if(parsedCache.updateAt > Date.now())
      return { data: parsedCache.data, cached: true };
  }

  const accData = await parseMatches(puuid, region, platform, data.history.filter((x) => x.queueId !== parseQueue("competitive", platform)).slice(0, 3));
  const accCompetitive = await parseMatches(puuid, region, platform, data.history.filter((x) => x.queueId === parseQueue("competitive", platform)).slice(0, 3));


  await redis.set(parseKey(`matchlist:${puuid}`, platform), JSON.stringify({ data: { data: accData, competitiveMatches: accCompetitive }, updateAt: Date.now() + 1000 * 60 }));
  
  return {
    data: {
      data: accData,
      competitiveMatches: accCompetitive
    },
    cached: false,
  };
}

export async function checkMMR(
  puuid: string,
  region: string,
  platform: "pc" | "console",
  matchlist: RedisMatchlist[],
  useCache = true
) {
  if (useCache) {

    const cache = await redis.get(parseKey(`mmr:${puuid}`, platform));

    return JSON.parse(cache!) as {
      tier: number;
      rr: number | null;
      leaderboard_rank: number | null;
      threshold: number | null;
    } | null;
  }

  if(!matchlist.length) return null;

  let leaderboardData: {
    rr: number;
    threshold: number | null;
    placement: number;
  } | null = null;

  const seasonId = (
    await RiotRequestManager.get<RiotGetValorantContent>(
      "val/content/v1/contents",
      "eu"
    )
  ).acts.find((x) => x.isActive)!.id;

  const tier = matchlist[0].competitiveTier;

  if (tier >= 24) {
    const leaderboard = await RiotRequestManager.getLeaderboard(
      1,
      1,
      region,
      platform
    );

    if (leaderboard.players[0].puuid === puuid) {
      leaderboardData = {
        rr: leaderboard.players[0].rankedRating,
        threshold:
          tier < 26
            ? leaderboard.tierDetails[tier as 24 | 25 | 26 | 27]
                .rankedRatingThreshold
            : null,
        placement: 1,
      };
    } else {
      let index =
        leaderboard.tierDetails[tier as 24 | 25 | 26 | 27].startingIndex;

      while (!leaderboardData) {
        const players = await RiotRequestManager.getLeaderboard(
          200,
          index,
          region,
          platform
        );

        const player = players.players.find((x) => x.puuid === puuid);

        if (player) {

          let threshold = tier < 26
          ? leaderboard.tierDetails[(tier + 1) as 24 | 25 | 26 | 27]
              .rankedRatingThreshold
          : null;

          if(tier === 26){
            const lastRadiant = await RiotRequestManager.getLeaderboard(1, leaderboard.tierDetails['26'].startingIndex - 1, region, platform);
            threshold = lastRadiant.players[0].rankedRating + 1;
          }

          leaderboardData = {
            rr: player.rankedRating,
            threshold,
            placement: player.leaderboardRank,
          };

          break;
        } else {
          index += 200;

          if (index > leaderboard.totalPlayers) break;
        }
      }
    }
  }

  const data = {
    tier: seasonId !== matchlist[0].seasonId ? 0 : tier,
    rr: leaderboardData?.rr ?? null,
    leaderboard_rank: leaderboardData?.placement ?? null,
    threshold: leaderboardData?.threshold ?? null,
  };

  await redis.set(parseKey(`mmr:${puuid}`, platform), JSON.stringify(data));

  return data;
}


export async function checkPlayer(data: RedisMatchlist, platform: "pc" | "console") {
  return {
    puuid: data.puuid,
    tagLine: data.tagLine,
    username: data.username,
    accountLevel: data.accountLevel,
    playerCard: data.playerCard,
    platform
  };
}

export function parseQueue(queue: string, platform: string) {
  return `${platform === "console" ? "console_" : ""}${queue}`;
}

export function parseKey(key: string, platform: string) {
  return `${platform}_${key}`;
}

export async function parseMatches(
  puuid: string,
  region: string,
  platform: "pc" | "console",
  matches: BaseMatch[]
) {
  const accData: RedisMatchlist[] = [];

  for (const match of matches) {
    let matchData =
      ((await redis.get(
        `match:${match.matchId}`
      )) as RiotGetMatchResponse | null) ||
      (await RiotRequestManager.getMatch(match.matchId, region, platform));

    if(typeof matchData === "string") matchData = JSON.parse(matchData);

    const player = matchData.players.find((x) => x.puuid === puuid)!;

    const isDeathmatch =
      matchData.matchInfo.queueId === parseQueue("deathmatch", platform);

    const team = matchData.teams.find((x) => x.teamId === player.teamId)!;

    const otherTeam = matchData.teams.find((x) => x.teamId !== player.teamId)!;

    const score = isDeathmatch
      ? player.stats.kills.toString()
      : match.queueId === parseQueue("hurm", platform) || match.queueId === '' && matchData.matchInfo.gameMode.includes('HURM')
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
      (a, b) => b.stats?.score || 0 - a.stats?.score || 0
    );

    const pushData = {
      id: match.matchId,
      agentId: player.characterId,
      mapId: matchData.matchInfo.mapId,
      mode: matchData.matchInfo.gameMode,
      isDeathmatch,
      score,
      kills: player.stats.kills,
      deaths: player.stats.deaths,
      assists: player.stats.assists,
      headshots: (damage.headshots / shots).toFixed(2),
      bodyshots: (damage.bodyshots / shots).toFixed(2),
      legshots: (damage.legshots / shots).toFixed(2),
      won: team.won,
      acs: Math.round(player.stats.score / team.roundsPlayed),
      mvp: isDeathmatch ? false : allScores[0].puuid === puuid,
      teamMvp: isDeathmatch
        ? false
        : allScores.filter((x) => x.teamId === team.teamId)[0].puuid === puuid,
      competitiveTier: player.competitiveTier,
      puuid: player.puuid,
      playerCard: player.playerCard,
      tagLine: player.tagLine,
      username: player.gameName,
      accountLevel: player.accountLevel,
      timestamp: new Date(
        matchData.matchInfo.gameStartMillis +
          matchData.matchInfo.gameLengthMillis
      ),
      seasonId: matchData.matchInfo.seasonId,
      queueId: matchData.matchInfo.queueId === '' ? 'custom' : normalizeQueue(matchData.matchInfo.queueId, platform),
    };

    await redis.set(`match:${match.matchId}`, JSON.stringify(matchData));

    accData.push(pushData);
  }

  return accData;
}

export function normalizeQueue(queue: string, platform: string) {
  return queue.replace(`${platform}_`, "");
}

export { router as Player };
