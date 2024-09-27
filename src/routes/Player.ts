import { Router } from "express";
import { GetValorantAccountByPuuidResponse, Redis, RedisMatchlist, RedisMMR, RedisMMRHistory, RequestManager } from "../lib";
import { redis } from "..";
import { User } from "../models";


const router = Router();

router.get("/:channel_id", async (req, res) => {

  const user = await User.findOne({ channelId: req.params.channel_id });

  if (!user)
    return res.status(404).json({ status: 404, error: "User was not found" });

  const data = await redis.hgetall(user.puuid) as { matchlist_pc?: string, player: string, mmr_pc?: string, mmrHistory_pc?: string, matchlist_console?: string, mmr_console?: string, mmrHistory_console?: string };

  if (!data || !Object.keys(data).length) {
    
    const entry = await createEntry(user.puuid, user.region, user.platform, user.match_history);

    return res.status(200).json({ status: 200, data: { ...entry, matchHistory: user.match_history } });
  } 

  const matchlist = user.match_history ? await checkMatchlist(user.puuid, user.region, user.platform, data[`matchlist_${user.platform}`] ? JSON.parse(data[`matchlist_${user.platform}`]!) : null) : null;

  const mmrHistory = user.match_history ? await checkMMRHistory(user.puuid, user.region, user.platform, data[`mmrHistory_${user.platform}`] ? JSON.parse(data[`mmrHistory_${user.platform}`]!) : null) : null;

  const player = await checkPlayer(user.puuid, user.platform, data[`mmr_${user.platform}`] ? JSON.parse(data.player) : null);

  const mmr = await checkMMR(user.puuid, user.region, user.platform, data[`mmr_${user.platform}`] ? JSON.parse(data[`mmr_${user.platform}`]!) : null);

  if(!player) return res.status(404).json({ status: 404, error: "Player was not found." });

  return res.status(200).json({ status: 200, data: { matchlist, player, mmr, mmrHistory, matchHistory: user.match_history } });

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

    const { data, headers, status } = await RequestManager.getMatchList(puuid, region, platform);

    const query = {
      updateAt: Date.now() + Number(headers.get("x-cache-ttl") ?? 300) * 1000,
      data: [] as RedisMatchlist[]
    };

    if(status !== 200){

      await redis.hset(
        puuid,
        parseKey("matchlist", platform),
        JSON.stringify(query)
      );  

      return null;
    };
    
    
    const filtered = data.filter((x) => x.metadata.queue.id !== 'competitive').slice(0, 3);

    const acc = 3 - filtered.length;

    let matches = 0;

    for(const match of filtered){

      if(matchlist?.data.find((x) => x.id === match.metadata.match_id)) matches++;

      const player = match.players.find((_) => _.puuid === puuid)!;
  
      const team = match.teams.find((_) => _.team_id === player.team_id)!;

      const isDeathmatch = ['deathmatch', 'console_deathmatch'].includes(match.metadata.queue.id);

      const score = isDeathmatch ? player.stats.kills.toString() : `${team.rounds.won} - ${team.rounds.lost}`;

      const shoots = player.stats.bodyshots + player.stats.headshots + player.stats.legshots;

      query.data.push({
        id: match.metadata.match_id,
        agent: player.agent,
        map: match.metadata.map,
        cluster: match.metadata.cluster,
        mode: match.metadata.queue.name,
        isDeathmatch,
        score,
        kills: player.stats.kills,
        deaths: player.stats.deaths,
        assists: player.stats.assists,
        headshots: (player.stats.headshots / shoots).toFixed(2),
        bodyshots: (player.stats.bodyshots / shoots).toFixed(2),
        legshots: (player.stats.legshots / shoots).toFixed(2),
        won: isDeathmatch ? player.stats.kills >= 40 : team.rounds.won > team.rounds.lost,
        acs: Math.round(player.stats.score / match.rounds.length),
        mvp: isDeathmatch ? false: match.players.sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
        teamMvp: isDeathmatch ? false: match.players.filter((_) => _.team_id === player.team_id).sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
      });
    }

    if(acc > 0){
      for(let i = 0; i < acc; i++){
        const data = matchlist?.data[matches + i];
        if(!data) break;
        query.data.push(data);
      }
    }

    await redis.hset(
      puuid,
      parseKey("matchlist", platform),
      JSON.stringify(query)
    );

    return query;
  }
}

export async function checkPlayer(puuid: string, platform: 'pc' | 'console', player?: Redis<GetValorantAccountByPuuidResponse>){
    if((player?.updateAt || 0) > Date.now()){
        return player;
    } else {
        const { data, headers, status } = await RequestManager.getValorantAccountByPuuid(puuid);

        if(status !== 200) return null;

        const query = {
            updateAt: Date.now() + Number(headers.get("x-cache-ttl") ?? 300) * 1000,
            data: { ...data, platform }
        }

        await redis.hset(puuid, "player", JSON.stringify(query));

        return query;
    }
}

export async function checkMMR(puuid: string, region: string, platform: 'pc' | 'console', mmr?: Redis<RedisMMR>){
    if((mmr?.updateAt || 0) > Date.now()){
        return mmr;
    } else {
        const { data, headers, status } = await RequestManager.getMMR(puuid, region, platform);

        const query = {
          updateAt: Date.now() + Number(headers?.get("x-cache-ttl") ?? 300) * 1000,
            data: data? {
                tier: data.current.tier,
                rr: data.current.rr,
                leaderboard_rank: data.current.leaderboard_placement,
                account: data.account
            } : null
        }

        if(status !== 200){
          
          await redis.hset(puuid, parseKey("mmr", platform), JSON.stringify(query));

          return null;
        };

        await redis.hset(puuid, parseKey("mmr", platform), JSON.stringify(query));

        return query;
    }
}

export async function checkMMRHistory(puuid: string, region: string, platform: 'pc' | 'console', history?: Redis<RedisMMRHistory[]>){

    if((history?.updateAt || 0) > Date.now()){
        return history;
    } else {
        const { Matches, headers, status } = await RequestManager.getMMRHistory(puuid, region, platform);

        const query: { updateAt: number, data: RedisMMRHistory[] } = {
          updateAt: Date.now() + Number(headers.get("x-cache-ttl") ?? 300) * 1000,
          data: []
        }

        if(status !== 200){
          await redis.hset(puuid, parseKey("mmrHistory", platform), JSON.stringify(query));
          return null;
        }

        const aggregate = 3 - Matches.length;

        let matches = 0;

        for(const match of Matches.slice(0, 3)){

          const data = history?.data.find((x) => x.id === match.MatchID);

          if(data){
            matches++;
            query.data.push(data);
            continue;
          }

          const { data: matchData, status } = await RequestManager.getMatch(match.MatchID, region);

          if(status !== 200) return;

          const player = matchData.players.find((_) => _.puuid === puuid)!;

          const team = matchData.teams.find((_) => _.team_id === player.team_id)!;
        
          const score = `${team.rounds.won} - ${team.rounds.lost}`;
        
          const shoots = player.stats.bodyshots + player.stats.headshots + player.stats.legshots;
        
          query.data.push({
            id: match.MatchID,
            agent: player.agent,
            map: matchData.metadata.map,
            cluster: matchData.metadata.cluster,
            mode: matchData.metadata.queue.name,
            isDeathmatch: false,
            score,
            kills: player.stats.kills,
            deaths: player.stats.deaths,
            assists: player.stats.assists,
            headshots: (player.stats.headshots / shoots).toFixed(2),
            bodyshots: (player.stats.bodyshots / shoots).toFixed(2),
            legshots: (player.stats.legshots / shoots).toFixed(2),
            won: team.rounds.won > team.rounds.lost,
            acs: Math.round(player.stats.score / matchData.rounds.length),
            mvp: matchData.players.sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
            teamMvp: matchData.players.filter((_) => _.team_id === player.team_id).sort((a, b) => b.stats.score - a.stats.score)[0].puuid === player.puuid,
            tierAfterUpdate: match.TierAfterUpdate,
            tierBeforeUpdate: match.TierBeforeUpdate,
            rrChange: match.RankedRatingEarned
          });

          
        }

        if(aggregate > 0){
          for(let i = 0; i < aggregate; i++){
            const data = history?.data[matches + i];
            if(!data) break;
            query.data.push(data);
          }
        }

        await redis.hset(puuid, parseKey("mmrHistory", platform), JSON.stringify(query));

        return query;
    }

}


export async function createEntry(puuid: string, region: string, platform: 'pc' | 'console', displayMatchlist: boolean){
  const mmr = await checkMMR(puuid, region, platform);
  const player = await checkPlayer(puuid, platform);
  const matchlist = displayMatchlist ? await checkMatchlist(puuid, region, platform) : null
  const mmrHistory = displayMatchlist ? await checkMMRHistory(puuid, region, platform) : null;

  return { mmr, player, matchlist, mmrHistory };
}

export function parseKey(key: string, platform: 'pc' | 'console'): `${string}_${'pc' | 'console'}` {
  return `${key}_${platform}`;
}

export { router as Player };
