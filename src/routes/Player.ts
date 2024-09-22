import { Router } from 'express';
import { GetMatchListResponse, Redis, RequestManager } from '../lib';
import { redis } from '..';
import { User } from '../models';

const router = Router();

router.get('/:channel_id', async(req, res) => {

    const user = await User.findOne({ channelId: req.params.channel_id });

    if(!user) return res.status(404).json({ status: 404, error: 'User was not found' });

    const data = await redis.hgetall(req.params.channel_id);

    if(!data || !Object.keys(data).length){

        const { data, headers } = await RequestManager.getMatchList(user!.puuid);

        await redis.hset(req.params.channel_id, 'matchlist', JSON.stringify({ updateAt: Date.now() + Number(headers.get('x-cache-ttl')) * 1000, data }));

        res.setHeader('Cache', 'MISS');

        return res.status(200).json(data);

    }

    const matchlist = JSON.parse(data.matchlist) as Redis<GetMatchListResponse>;

    if(matchlist.updateAt > Date.now()){

        res.setHeader('Cache', 'SOME');

        return res.status(200).json(matchlist);

    } else {

        const { data, headers } = await RequestManager.getMatchList(user!.puuid);

        await redis.hset(req.params.channel_id, 'matchlist', JSON.stringify({ updateAt: Date.now() + Number(headers.get('x-cache-ttl')) * 1000, data }));

        res.setHeader('Cache', 'MISS');

        return res.status(200).json(data);

    }

});

export { router as Player };