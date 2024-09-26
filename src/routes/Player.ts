import { Router } from "express";
import { GetValorantAccountByPuuidResponse, Match, Redis, RedisMatchlist, RedisMMR, RedisMMRHistory, RequestManager } from "../lib";
import { redis } from "..";
import { User } from "../models";


const router = Router();

router.get("/:channel_id", async (req, res) => {

  const user = await User.findOne({ channelId: req.params.channel_id });

  if (!user)
    return res.status(404).json({ status: 404, error: "User was not found" });

  const data = await redis.hgetall(user.puuid) as { matchlist: string, player: string, mmr: string, mmrHistory: string };

  if (!data || !Object.keys(data).length) {
    
    const entry = await createEntry(user.puuid, user.region, user.platform, user.match_history);

    return res.status(200).json({ status: 200, data: entry });
  } 

  const matchlist = user.match_history ? await checkMatchlist(user.puuid, user.region, user.platform, JSON.parse(data.matchlist)) : null;

  const mmrHistory = user.match_history ? await checkMMRHistory(user.puuid, user.region, user.platform, JSON.parse(data.mmrHistory)) : null;

  const player = await checkPlayer(user.puuid, JSON.parse(data.player));

  const mmr = await checkMMR(user.puuid, user.region, user.platform, JSON.parse(data.mmr));

  return res.status(200).json({ status: 200, data: { matchlist, player, mmr, mmrHistory } });

});

export async function checkMatchlist(
  puuid: string,
  region: string,
  platform: 'console' | 'pc',
  matchlist?: Redis<RedisMatchlist[]>
) {

  if ((matchlist?.updateAt || 0) > Date.now()) {
    console.log('Using cached matchlist')
    return matchlist;
  } else {

    console.log('Requesting matchlist')
    const { data, headers } = await RequestManager.getMatchList(puuid, region, platform);
    
    const matchlist = data.filter((x) => x.metadata.queue.id !== 'competitive').slice(0, 3).map((x) => {

        const player = x.players.find((_) => _.puuid === puuid)!;
  
        const team = x.teams.find((_) => _.team_id === player.team_id)!;
  
        const score = x.metadata.queue.id === 'deathmatch' ? player.stats.kills.toString() : `${team.rounds.won} - ${team.rounds.lost}`;
  
        const shoots = player.stats.bodyshots + player.stats.headshots + player.stats.legshots;
  
  
        return {
          id: x.metadata.match_id,
          agent: player.agent,
          map: x.metadata.map,
          cluster: x.metadata.cluster,
          mode: x.metadata.queue.name,
          isDeathmatch: x.metadata.queue.id === "deathmatch",
          score,
          kills: player.stats.kills,
          deaths: player.stats.deaths,
          assists: player.stats.assists,
          headshots: (player.stats.headshots / shoots).toFixed(2),
          bodyshots: (player.stats.bodyshots / shoots).toFixed(2),
          legshots: (player.stats.legshots / shoots).toFixed(2),
          won: x.metadata.queue.id === "deathmatch" ? player.stats.kills >= 40 : team.rounds.won > team.rounds.lost,
          acs: Math.round(player.stats.score / x.rounds.length),
          mvp: x.metadata.queue.id === "deathmatch" ? false: x.players.sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
          teamMvp: x.metadata.queue.id === "deathmatch" ? false: x.players.filter((_) => _.team_id === player.team_id).sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
        };
      });

    const query = {
      updateAt: Date.now() + Number(headers.get("x-cache-ttl")) * 1000,
      data: matchlist
    };

    await redis.hset(
      puuid,
      "matchlist",
      JSON.stringify(query)
    );

    return query;
  }
}

export async function checkPlayer(puuid: string, player?: Redis<GetValorantAccountByPuuidResponse>){
    if((player?.updateAt || 0) > Date.now()){
        return player;
    } else {
        const { data, headers } = await RequestManager.getValorantAccountByPuuid(puuid);

        const query = {
            updateAt: Date.now() + Number(headers.get("x-cache-ttl")) * 1000,
            data
        }

        await redis.hset(puuid, "player", JSON.stringify(query));

        return query;
    }
}

export async function checkMMR(puuid: string, region: string, platform: 'pc' | 'console', mmr?: Redis<RedisMMR>){
    if((mmr?.updateAt || 0) > Date.now()){
        return mmr;
    } else {
        const { data, headers } = await RequestManager.getMMR(puuid, region, platform).catch(() => ({ data: null, headers: null }));

        const query = {
          updateAt: Date.now() + Number(headers?.get("x-cache-ttl") ?? 300) * 1000,
            data: data? {
                tier: data.current.tier,
                rr: data.current.rr,
                leaderboard_rank: data.current.leaderboard_placement,
                account: data.account
            } : null
        }

        await redis.hset(puuid, "mmr", JSON.stringify(query));

        return query;
    }
}

export async function checkMMRHistory(puuid: string, region: string, platform: 'pc' | 'console', history?: Redis<RedisMMRHistory[]>){

    if((history?.updateAt || 0) > Date.now()){
        return history;
    } else {
        const { Matches, headers } = await RequestManager.getMMRHistory(puuid, region, platform);

        const query: { updateAt: number, data: RedisMMRHistory[] } = {
          updateAt: Date.now() + Number(headers.get("x-cache-ttl")) * 1000,
          data: []
        }

        for(const match of Matches.slice(0, 3)){

          const data = history?.data.find((x) => x.id === match.MatchID);

          if(data){
            query.data.push(data);
            continue;
          }

          const { data: matchData } = await RequestManager.getMatch(match.MatchID, region);

          const player = matchData.players.find((_) => _.puuid === puuid)!;

          const team = matchData.teams.find((_) => _.team_id === player.team_id)!;
        
          const score = matchData.metadata.queue.id === 'deathmatch' ? player.stats.kills.toString() : `${team.rounds.won} - ${team.rounds.lost}`;
        
          const shoots = player.stats.bodyshots + player.stats.headshots + player.stats.legshots;
        
          query.data.push({
            id: match.MatchID,
            agent: player.agent,
            map: matchData.metadata.map,
            cluster: matchData.metadata.cluster,
            mode: matchData.metadata.queue.name,
            isDeathmatch: matchData.metadata.queue.id === "deathmatch",
            score,
            kills: player.stats.kills,
            deaths: player.stats.deaths,
            assists: player.stats.assists,
            headshots: (player.stats.headshots / shoots).toFixed(2),
            bodyshots: (player.stats.bodyshots / shoots).toFixed(2),
            legshots: (player.stats.legshots / shoots).toFixed(2),
            won: matchData.metadata.queue.id === "deathmatch" ? player.stats.kills >= 40 : team.rounds.won > team.rounds.lost,
            acs: Math.round(player.stats.score / matchData.rounds.length),
            mvp: matchData.metadata.queue.id === "deathmatch" ? false: matchData.players.sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
            teamMvp: matchData.metadata.queue.id === "deathmatch" ? false: matchData.players.filter((_) => _.team_id === player.team_id).sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
            tierAfterUpdate: match.TierAfterUpdate,
            tierBeforeUpdate: match.TierBeforeUpdate,
            rrChange: match.RankedRatingEarned
          });
          
        }

        await redis.hset(puuid, "mmrHistory", JSON.stringify(query));

        return query;
    }

}


export async function createEntry(puuid: string, region: string, platform: 'pc' | 'console', displayMatchlist: boolean){
  const mmr = await checkMMR(puuid, region, platform);
  const player = await checkPlayer(puuid);
  const matchlist = displayMatchlist ? await checkMatchlist(puuid, region, platform) : null
  const mmrHistory = displayMatchlist ? await checkMMRHistory(puuid, region, platform) : null;

  return { mmr, player, matchlist, mmrHistory };
}

async function parseMatch(puuid: string, match: Match, region: string, matches: Match[], acc: number){

  const { data: matchData } = await RequestManager.getMatch(match.MatchID, region);

  if(matchData.metadata.queue.id === 'competitive') {
    const match = matches[4 + acc];
    if(!match) return null;
    acc++;
    return parseMatch(puuid, match, region, matches, acc);
  }

  const player = matchData.players.find((_) => _.puuid === puuid)!;

  const team = matchData.teams.find((_) => _.team_id === player.team_id)!;

  const score = matchData.metadata.queue.id === 'deathmatch' ? player.stats.kills.toString() : `${team.rounds.won} - ${team.rounds.lost}`;

  const shoots = player.stats.bodyshots + player.stats.headshots + player.stats.legshots;

  return {
    id: match.MatchID,
    agent: player.agent,
    map: matchData.metadata.map,
    cluster: matchData.metadata.cluster,
    mode: matchData.metadata.queue.name,
    isDeathmatch: matchData.metadata.queue.id === "deathmatch",
    score,
    kills: player.stats.kills,
    deaths: player.stats.deaths,
    assists: player.stats.assists,
    headshots: (player.stats.headshots / shoots).toFixed(2),
    bodyshots: (player.stats.bodyshots / shoots).toFixed(2),
    legshots: (player.stats.legshots / shoots).toFixed(2),
    won: matchData.metadata.queue.id === "deathmatch" ? player.stats.kills >= 40 : team.rounds.won > team.rounds.lost,
    acs: Math.round(player.stats.score / matchData.rounds.length),
    mvp: matchData.metadata.queue.id === "deathmatch" ? false: matchData.players.sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
    teamMvp: matchData.metadata.queue.id === "deathmatch" ? false: matchData.players.filter((_) => _.team_id === player.team_id).sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
    tierAfterUpdate: match.TierAfterUpdate,
    tierBeforeUpdate: match.TierBeforeUpdate,
    rrChange: match.RankedRatingEarned
  };
}

export { router as Player };
