import { Router } from "express";
import { verify } from "jsonwebtoken";
import { connections } from "..";
import { AuthJWTPayload, RiotGetAccountShard, RiotRequestManager, RSORequestManager } from "../lib";
import { User } from "../models";
import "dotenv/config";

const router = Router();

router.get("/callback", async (req, res) => {

  const { state, code } = req.query as { state: string; code: string };

  if (!state || !code) {
    return res.status(400).json({ status: 400, error: "Bad Request" });
  }

  try {
    const payload = verify(
      state,
      Buffer.from(process.env.AUTH_JWT_SECRET, "base64")
    ) as AuthJWTPayload;

    const connection = connections.get(payload.identity);

    if (!connection) {
      return res.status(401).json({ status: 401, error: "Unauthorized" });
    }

    const authData = await RSORequestManager.getToken(code);

    const user = await RiotRequestManager.getValorantAccount(
      authData.access_token,
      authData.refresh_token
    );

    const shardInfo: RiotGetAccountShard | false = await RiotRequestManager.getAccountShard(user.puuid).catch(() => false);

    if(!shardInfo){
      connection.socket.send(
        JSON.stringify({ metadata: { type: "no_valorant_account" } })
      );
      connection.socket.close();
      return res.redirect("/#noValorantAccount");
    }

    const platforms = [];

    const pc = await RiotRequestManager.getMatchlist(
      user.puuid,
      shardInfo.activeShard,
      "pc"
    ).catch(() => false);

    if (pc) platforms.push("pc");

    const _console = await RiotRequestManager.getMatchlist(
      user.puuid,
      shardInfo.activeShard,
      "console"
    ).catch(() => false);

    if (_console) platforms.push("console");

    if (!_console && !pc) {
      connection.socket.send(
        JSON.stringify({ metadata: { type: "no_valorant_account" } })
      );
      connection.socket.close();
      return res.redirect("/#noValorantAccount");
    }

    const users = await User.find({ puuid: user.puuid });

    for(const user of users){
      user.auth = {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
      }
      await user.save();
    }

    await User.findOneAndUpdate(
      { channelId: connection.payload.channel_id },
      {
        puuid:
          user.puuid,
        region: shardInfo.activeShard,
        username: user.gameName,
        tag: user.tagLine,
        config: {
          platform: platforms[0],
          match_history: true,
          daily: {
            enabled: true,
            only_competitive: false,
          },
        },
        platforms,
        auth: {
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    connection.socket.send(
      JSON.stringify({
        metadata: { type: "auth_complete" },
        payload: {
          puuid:
            user.puuid,
          gameName: user.gameName,
          tagLine: user.tagLine,
        },
      })
    );

    connection.socket.close();

    return res.redirect("/#afterLogin");

  } catch (e) {
    console.error(e);
    return res.status(401).json({ status: 401, error: "Unauthorized" });
  }
});

router.get("/mockcallback", async (req, res) => {
  
  const { state, code } = req.query as { state: string; code: string };

  if (!state || !code) {
    return res.status(400).json({ status: 400, error: "Bad Request" });
  }

  try {
    const payload = verify(
      state,
      Buffer.from(process.env.AUTH_JWT_SECRET, "base64")
    ) as AuthJWTPayload;

    const connection = connections.get(payload.identity);

    if (!connection) {
      return res.status(401).json({ status: 401, error: "Unauthorized" });
    }

    const authData = await RSORequestManager.getToken(code, process.env.RSO_REDIRECT_URI.split('/').slice(0, -1).join('/') + '/mockcallback');

    const user = await RiotRequestManager.getValorantAccount(
      authData.access_token,
      authData.refresh_token
    );

    const shardInfo: RiotGetAccountShard | false = await RiotRequestManager.getAccountShard(user.puuid).catch(() => false);

    if(!shardInfo){
      connection.socket.send(
        JSON.stringify({ metadata: { type: "no_valorant_account" } })
      );
      connection.socket.close();
      return res.redirect("/#noValorantAccount");
    }

    const platforms = [];

    const pc = await RiotRequestManager.getMatchlist(
      user.puuid,
      shardInfo.activeShard,
      "pc"
    ).catch(() => false);

    if (pc) platforms.push("pc");

    const _console = await RiotRequestManager.getMatchlist(
      user.puuid,
      shardInfo.activeShard,
      "console"
    ).catch(() => false);

    if (_console) platforms.push("console");

    if (!_console && !pc) {
      connection.socket.send(
        JSON.stringify({ metadata: { type: "no_valorant_account" } })
      );
      connection.socket.close();
      return res.redirect("/#noValorantAccount");
    }

    const users = await User.find({ puuid: user.puuid });

    for(const user of users){
      user.auth = {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
      }
      await user.save();
    }

    await User.findOneAndUpdate(
      { channelId: 'mock' },
      {
        puuid:
          user.puuid,
        region: shardInfo.activeShard,
        username: user.gameName,
        tag: user.tagLine,
        config: {
          platform: platforms[0],
          match_history: true,
          daily: {
            enabled: true,
            only_competitive: false,
          },
        },
        platforms,
        auth: {
          access_token: authData.access_token,
          refresh_token: authData.refresh_token
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    connection.socket.send(
      JSON.stringify({
        metadata: { type: "auth_complete" },
        payload: {
          puuid:
            user.puuid,
          gameName: user.gameName,
          tagLine: user.tagLine,
        },
      })
    );

    connection.socket.close();

    return res.redirect("/#afterLogin");

  } catch (e) {
    console.error(e);
    return res.status(401).json({ status: 401, error: "Unauthorized" });
  }

});

export { router as Auth };
