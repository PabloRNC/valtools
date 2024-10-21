import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Setup } from './Setup';
import { Player, checkDaily, checkMMR, checkMatchlist, checkPlayer } from './Player';
import { ConsoleRegions, PCRegions, RiotRequestManager } from '../lib';
import { User } from '../models';
import { isAuthorized } from '../middlewares';
import { redis } from '..';

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { status: 429, error: "Too many requests, please try again later." }
})

const router = Router();

router.get('/leaderboard/:platform/:region', limiter, async(req, res) => {
 
  const { platform, region } = req.params;

  const obj = {
    "pc": PCRegions,
    "console": ConsoleRegions
  }

  if(!["pc", "console"].includes(platform) || !obj[platform as 'pc' | 'console'].concat('global').includes(region))
    return res.status(400).json({ status: 400, error: "Invalid platform or region" });

  let leaderboard: any[] = [];

  if(region === 'global') {

    for(const reg of obj[platform as 'pc' | 'console']) {
      const data = JSON.parse(await redis.get(`leaderboard:${platform}:${reg}:total`) as string);
      if(!data) continue;
      if(!leaderboard) leaderboard = data;
      else leaderboard = leaderboard.concat(data);
    }
    
    leaderboard.sort((a, b) => b.rankedRating - a.rankedRating);

  } else {

   leaderboard = JSON.parse(await redis.get(`leaderboard:${platform}:${region}:total`) as string);
  
  }

  const parsedLeaderboard = leaderboard.map((entry: any) => {
    const { puuid, leaderboardRank, ...rest } = entry;

    return {
      ...rest
    }
  })

  return res.json(parsedLeaderboard);

});

router.get('/players/mock', async(req, res) => {

  const user = await User.findOne({ channelId: 'mock' });


  if (!user)
    return res.status(404).json({ status: 404, error: "User not found" });

  const { activeShard } = await RiotRequestManager.getAccountShard(user.puuid);

  if(user.region !== activeShard) {
    user.region = activeShard;
    await user.save();
  }

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
  );

  const player = await checkPlayer(matchlist.data[0] || matchlist.competitiveMatches[0], user.config.platform);

  const daily = user.config.daily.enabled ? await checkDaily(user.puuid, user.region, user.config.platform, user.config.daily.only_competitive) : null;

  res.setHeader('Cache', `${cached ? 'HIT' : 'MISS'}`).json({
    matchlist: user.config.match_history ? matchlist.data : null,
    mmr,
    player,
    mmrHistory: user.config.match_history ? matchlist.competitiveMatches : null,
    daily
  });
})

router.delete('/setup/mock', async(req, res) => {
    await User.findOneAndDelete({ channelId: 'mock' });
    return res.sendStatus(200);
});
router.use('/setup', isAuthorized, Setup);
router.use('/players', isAuthorized, Player);


export { router as Api };