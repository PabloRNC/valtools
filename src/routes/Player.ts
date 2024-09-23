import { Router } from "express";
import { GetValorantAccountByPuuidResponse, Redis, RedisMatchlist, RedisMMR, RequestManager } from "../lib";
import { redis } from "..";
import { User } from "../models";


const router = Router();

router.get("/:channel_id", async (req, res) => {

  const user = await User.findOne({ channelId: req.params.channel_id });

  if (!user)
    return res.status(404).json({ status: 404, error: "User was not found" });

  const data = await redis.hgetall(req.params.channel_id) as { matchlist: string, player: string, mmr: string };

  if (!data || !Object.keys(data).length) {
    
    const entry = await createEntry(req.params.channel_id, user.puuid, user.region, user.match_history);

    return res.status(200).json({ status: 200, data: entry });
  }

  const matchlist = user.match_history ? await checkMatchlist(req.params.channel_id, user.puuid, user.region, JSON.parse(data.matchlist)) : null;

  const player = await checkPlayer(req.params.channel_id, user.puuid, JSON.parse(data.player));

  const mmr = await checkMMR(req.params.channel_id, user.puuid, user.region, JSON.parse(data.mmr));

  return res.status(200).json({ status: 200, data: { matchlist, player, mmr } });

});

export async function checkMatchlist(
  channel_id: string,
  puuid: string,
  region: string,
  matchlist?: Redis<RedisMatchlist[]>
) {
  if (matchlist?.updateAt || 0 > Date.now()) {
    return matchlist;
  } else {
    const { data, headers } = await RequestManager.getMatchList(puuid, region);

    const matchlist = data.slice(0, 5).map((x) => {

        const player = x.players.find((_) => _.puuid === puuid)!;
  
        const team = x.teams.find((_) => _.team_id === player.team_id)!;
  
        const score = x.metadata.queue.id === 'deathmatch' ? player.stats.kills.toString() : `${team.rounds.won} - ${team.rounds.lost}`;
  
        const shoots = player.stats.bodyshots + player.stats.headshots + player.stats.legshots;
  
  
        return {
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
          legshots: (player.stats.legshots / shoots).toFixed(2)
        };
      });

    await redis.hset(
      channel_id,
      "matchlist",
      JSON.stringify({
        updateAt: Date.now() + Number(headers.get("x-cache-ttl")) * 1000,
        data: matchlist,
      })
    );

    return matchlist;
  }
}

export async function checkPlayer(channel_id: string, puuid: string, player?: Redis<GetValorantAccountByPuuidResponse>){
    if(player?.updateAt || 0 > Date.now()){
        return player;
    } else {
        const { data, headers } = await RequestManager.getValorantAccountByPuuid(puuid);

        await redis.hset(channel_id, "player", JSON.stringify({
            updateAt: Date.now() + Number(headers.get("x-cache-ttl")) * 1000,
            data
        }));

        return data;
    }
}

export async function checkMMR(channel_id: string, puuid: string, region: string, mmr?: Redis<RedisMMR>){
    if(mmr?.updateAt || 0 > Date.now()){
        return mmr;
    } else {
        const { data, headers } = await RequestManager.getMMR(puuid, region);

        await redis.hset(channel_id, "mmr", JSON.stringify({
            updateAt: Date.now() + Number(headers.get("x-cache-ttl")) * 1000,
            data: {
                tier: data.current.tier,
                rr: data.current.rr,
                leaderboard_rank: data.current.leaderboard_placement,
                account: data.account
            }
        }));

        return data;
    }
}


export async function createEntry(channel_id: string, puuid: string, region: string, displayMatchlist: boolean){
  const mmr = await checkMMR(channel_id, puuid, region);
  const player = await checkPlayer(channel_id, puuid);
  const matchlist = displayMatchlist ? await checkMatchlist(channel_id, puuid, region) : null

  return { mmr, player, matchlist };
}
export { router as Player };
