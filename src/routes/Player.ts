import { Router } from "express";
import { DateTime } from 'luxon';
import { User } from "../models";
import { redis } from "..";
import {
  RedisMatchlist,
  RiotRequestManager,
  RiotGetMatchResponse,
  Redis,
  BaseMatch,
  RiotGetValorantMatchlist
} from "../lib";


const regionTimeZones = {
  ap: 'Asia/Tokyo',
  br: 'America/Sao_Paulo',
  eu: 'Europe/Berlin',
  kr: 'Asia/Seoul',
  latam: 'America/Mexico_City',
  na: 'America/New_York'
};

const router = Router();


router.get("/:channel_id", async (req, res) => {

  const { channel_id } = req.params;

  const user = await User.findOne({ channelId: channel_id });

  if (!user)
    return res.status(404).json({ status: 404, error: "User not found" });

  const { activeShard } = await RiotRequestManager.getAccountShard(user.puuid);

  if(user.region !== activeShard) {
    user.region = activeShard;
    await user.save();
  }

  const { data: matchlist, cached, riotMatchlist } = await checkMatchlist(
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
    matchlist.competitiveMatches
  );

  const player = await checkPlayer(matchlist.data[0] || matchlist.competitiveMatches[0], user.config.platform);


  const daily = user.config.daily.enabled ? await checkDaily(user.puuid, user.region, user.config.platform, riotMatchlist!, user.config.daily.only_competitive) : null;

  res.setHeader('Cache', `${cached ? 'HIT' : 'MISS'}`).status(200).json({
    matchlist: user.config.match_history ? matchlist.data : null,
    mmrHistory: user.config.match_history ? matchlist.competitiveMatches : null,
    daily,
    mmr,
    player
  });
});

export async function checkMatchlist(
  puuid: string,
  region: string,
  platform: "pc" | "console"
) {

  const cache = await redis.get(parseKey(`matchlist:${puuid}`, platform));

  if(cache){
    const parsedCache = JSON.parse(cache) as Redis<{
      data: RedisMatchlist[];
      competitiveMatches: RedisMatchlist[];
    }>;

    const matchlistCache = await redis.get(parseKey(`raw_matchlist:${puuid}`, platform));

    if(parsedCache.updateAt > Date.now())
      return { data: parsedCache.data, cached: true, riotMatchlist: matchlistCache ? JSON.parse(matchlistCache) as RiotGetValorantMatchlist : await RiotRequestManager.getMatchlist(puuid, region, platform) };
  }

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


  const accData = await parseMatches(puuid, region, platform, data.history.filter((x) => x.queueId !== parseQueue("competitive", platform)).slice(0, 3));
  const accCompetitive = await parseMatches(puuid, region, platform, data.history.filter((x) => x.queueId === parseQueue("competitive", platform)).slice(0, 3));


  await redis.set(parseKey(`matchlist:${puuid}`, platform), JSON.stringify({ data: { data: accData, competitiveMatches: accCompetitive }, updateAt: Date.now() + 1000 * 60 }));
  
  await redis.set(parseKey(`raw_matchlist:${puuid}`, platform), JSON.stringify(data));

  return {
    data: {
      data: accData,
      competitiveMatches: accCompetitive
    },
    cached: false,
    riotMatchlist: data
  };
}

export async function checkMMR(
  puuid: string,
  region: string,
  platform: "pc" | "console",
  matchlist: RedisMatchlist[],
) {

  console.log(puuid)

  const lastMatch = matchlist[0];

  const actId = await RiotRequestManager.getActId(region);

  if(lastMatch?.seasonId !== actId) return { tier: 0, rr: null, leaderboard_rank: null, threshold: null };

  if(lastMatch.competitiveTier < 24) return { tier: lastMatch.competitiveTier, rr: null, leaderboard_rank: null, threshold: null };
  
  const thresholds = await redis.get(`leaderboard:${platform}:${region}:thresholds`);

  const pages = await redis.keys(`leaderboard:${platform}:${region}:pages:*`);

  const parsedPages = [];

  for (const page of pages!) {

    const data = await redis.get(page);

    parsedPages.push(...JSON.parse(data!));
  }

  parsedPages.sort((a, b) => a.leaderboardRank - b.leaderboardRank);


  const leaderboardData = parsedPages.find((x) => x.puuid === puuid);

  if(!leaderboardData) return { tier: lastMatch.competitiveTier, rr: null, leaderboard_rank: null, threshold: null };

  let threshold = JSON.parse(thresholds!)[leaderboardData.competitiveTier + 1]?.rankedRatingThreshold;

  if(!threshold) threshold = null

  if(leaderboardData.competitiveTier === 26){
    threshold = parsedPages.filter((x) => x.competitiveTier === 27).pop().rankedRating + 1;
  }

  return {
    tier: leaderboardData.competitiveTier,
    rr: leaderboardData.rankedRating,
    leaderboard_rank: leaderboardData.leaderboardRank,
    threshold
  }

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

export async function checkDaily(puuid: string, region: string, platform: "pc" | "console", matchlist: RiotGetValorantMatchlist, only_competitive: boolean) {

  const daily = matchlist.history.sort((a, b) => b.gameStartTimeMillis - a.gameStartTimeMillis).filter((x) => {
   
    if(x.queueId === '') return false;

    if(only_competitive && x.queueId !== parseQueue("competitive", platform)) return false

    const nowInRegion = DateTime.now().setZone(regionTimeZones[region as 'eu' | 'br' | 'na' | 'kr' | 'latam' | 'ap']).startOf('day');

    const matchTime = DateTime.fromMillis(x.gameStartTimeMillis).setZone(regionTimeZones[region as 'eu' | 'br' | 'na' | 'kr' | 'latam' | 'ap']).startOf('day');

    return nowInRegion.equals(matchTime);    

  }).reverse();

  const obj = {
    won: 0,
    lost: 0,
    streak: 0
  }

  for (const match of daily) {

    let matchData = 
    ((await redis.get(
      `match:${match.matchId}`
    )) as RiotGetMatchResponse | null) ||
    (await RiotRequestManager.getMatch(match.matchId, region, platform));

    if(typeof matchData === "string") matchData = JSON.parse(matchData);

    const player = matchData.players.find((x) => x.puuid === puuid)!;

    const team = matchData.teams.find((x) => x.teamId === player.teamId)!;

    const won = team.won;

    if(won){
      obj.won++;
      obj.streak++;
    } else {
      if(matchData.teams.reduce((acc: boolean, x) => {
        if(!acc) return acc;
        if(x.won) acc = false;
        return acc;
      }, true)) continue;

      obj.streak = 0;
      obj.lost++;
    }

    await redis.set(`match:${match.matchId}`, JSON.stringify(matchData));

  }

  return obj;
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
      matchData.matchInfo.queueId === parseQueue("deathmatch", platform) || matchData.matchInfo.gameMode === '/Game/GameModes/Deathmatch/DeathmatchGameMode.DeathmatchGameMode_C';

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
      (a, b) => (b.stats?.score || 0) - (a.stats?.score || 0)
    );

    const drawn = matchData.teams.reduce((acc: boolean, x) => {
      if(!acc) return acc;
      if(x.won) acc = false;
      return acc;
    }, true)

    const pushData = {
      startedAt: new Date(matchData.matchInfo.gameStartMillis),
      id: match.matchId,
      agentId: player.characterId,
      mapId: matchData.matchInfo.mapId,
      mode: matchData.matchInfo.gameMode,
      isDeathmatch,
      score,
      kills: player.stats.kills,
      deaths: player.stats.deaths,
      assists: player.stats.assists,
      headshots: !isDeathmatch ? (damage.headshots / shots).toFixed(2) : '0',
      bodyshots: !isDeathmatch ? (damage.bodyshots / shots).toFixed(2) : '0',
      legshots: !isDeathmatch ? (damage.legshots / shots).toFixed(2) : '0',
      won: team.won,
      drawn,
      acs: Math.round(player.stats.score / player.stats.roundsPlayed),
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
