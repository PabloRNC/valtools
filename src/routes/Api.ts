import { Router } from 'express';
import { Setup } from './Setup';
import { Player, checkDaily, checkMMR, checkMatchlist, checkPlayer } from './Player';
import { RiotRequestManager } from '../lib';
import { User } from '../models';
import { isAuthorized } from '../middlewares';

const router = Router();

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