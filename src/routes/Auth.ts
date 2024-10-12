import { Router } from "express";
import { verify } from "jsonwebtoken";
import { connections } from "..";
import { AuthJWTPayload, RiotRequestManager, RSORequestManager } from "../lib";
import { User } from "../models";
import 'dotenv/config';

const router = Router();

router.get('/callback', async(req, res) => {

    const { state, code } = req.query as { state: string, code: string };

    if(!state || !code){
        return res.status(400).json({ status: 400, error: 'Bad Request' });
    }

    try {

        const payload = verify(state, Buffer.from(process.env.AUTH_JWT_SECRET, 'base64')) as AuthJWTPayload;

        const connection = connections.get(payload.identity);

        if(!connection){
            return res.status(401).json({ status: 401, error: 'Unauthorized' });
        }

        await User.findOneAndUpdate({ channelId: connection.payload.channel_id }, { puuid: '67_jP', region: 'eu', username: 'username', tag: 'tag' }, { upsert: true, new: true, setDefaultsOnInsert: true})

        connection.socket.send(JSON.stringify({ metadata: { type: 'auth_complete' }, payload: { puuid: '67_jP', gameName: 'username', tagLine: 'tag'} }));

        connection.socket.close();

        return res.redirect('/#afterLogin');

        const authData = await RSORequestManager.getToken(code);

        const user = await RiotRequestManager.getValorantAccount(authData.access_token);

        const shard = await RiotRequestManager.getAccountShard(user.puuid);

        //@ts-expect-error
        await User.findOneAndUpdate({ channelId: connection.payload.channel_id }, { puuid: user.puuid, region: shard.activeShard, username: user.gameName, tag: user.tagLine }, { upsert: true, new: true, setDefaultsOnInsert: true})
        
        //@ts-expect-error
        connection.socket.send(JSON.stringify({ metadata: { type: 'auth_complete' }, payload: { user } }));

        return res.sendStatus(200);

    } catch(e){
        console.error(e);
        return res.status(401).json({ status: 401, error: 'Unauthorized' });
    }
    
    


})


export { router as Auth };