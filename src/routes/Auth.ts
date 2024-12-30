import { Elysia, redirect, t } from "elysia";
import { verify } from "jsonwebtoken";
import { User } from "../models";
import type { AuthJWTPayload, RiotGetAccountShard } from "../lib";
import { RSORequestManager, RiotRequestManager } from "../lib";
import { connections } from "..";

export const Auth = new Elysia({ prefix: "/auth" });

Auth.get(
  "/callback",
  async ({ set, query: { state, code } }) => {
    let payload: AuthJWTPayload;

    try {
      payload = verify(
        state,
        Buffer.from(process.env.AUTH_JWT_SECRET, "base64"),
        { algorithms: ["HS256"] }
      ) as AuthJWTPayload;
    } catch (e) {
      set.status = 401;
      return { error: "Invalid state", status: 401 };
    }

    const connection = connections.get(payload.identity);

    if (!connection) {
      set.status = 401;
      return { error: "Invalid connection", status: 401 };
    }

    const authData = await RSORequestManager.getToken(code, process.env.RSO_REDIRECT_URI);

    const user = await RiotRequestManager.getValorantAccount(
      authData.access_token,
      authData.refresh_token
    );

    const shardInfo: RiotGetAccountShard | false =
      await RiotRequestManager.getAccountShard(user.puuid).catch(() => false);

    if (!shardInfo) {
      connection.ws.send({ metadata: { type: "no_valorant_account" } });
      connection.ws.close();
      return { redirect: "/#noValorantAccount" };
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
      connection.ws.send({ metadata: { type: "no_valorant_account" } });
      connection.ws.close();
      return redirect("/#noValorantAccount");
    }

    const users = await User.find({ puuid: user.puuid });

    for (const user of users) {
      user.auth = {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
      };

      await user.save();
    }

    await User.findOneAndUpdate(
      { channelId: payload.channel_id },
      {
        puuid: user.puuid,
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
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    connection.ws.send({
      metadata: { type: "auth_complete" },
      payload: {
        puuid: user.puuid,
        gameName: user.gameName,
        tagLine: user.tagLine,
      },
    });

    connection.ws.close();

    return redirect("/#afterLogin");
  },
  {
    query: t.Object({
      state: t.String(),
      code: t.String(),
    }),
  }
);

Auth.get(
  "/mockcallback",
  async ({ set, query: { state, code } }) => {

    let payload: AuthJWTPayload;

    try {
      payload = verify(
        state,
        Buffer.from(process.env.AUTH_JWT_SECRET, "base64"),
        { algorithms: ["HS256"] }
      ) as AuthJWTPayload;
    } catch (e) {
      set.status = 401;
      return { error: "Invalid state", status: 401 };
    }

    const connection = connections.get(payload.identity);

    if (!connection) {
      set.status = 401;
      return { error: "Invalid connection", status: 401 };
    }

    const authData = await RSORequestManager.getToken(code, process.env.RSO_REDIRECT_MOCK_URI);

    const user = await RiotRequestManager.getValorantAccount(
      authData.access_token,
      authData.refresh_token
    );

    const shardInfo: RiotGetAccountShard | false =
      await RiotRequestManager.getAccountShard(user.puuid).catch(() => false);

    if (!shardInfo) {
      connection.ws.send({ metadata: { type: "no_valorant_account" } });
      connection.ws.close();
      return { redirect: "/#noValorantAccount" };
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
      connection.ws.send({ metadata: { type: "no_valorant_account" } });
      connection.ws.close();
      return redirect("/#noValorantAccount");
    }

    const users = await User.find({ puuid: user.puuid });

    for (const user of users) {
      user.auth = {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
      };

      await user.save();
    }

    await User.findOneAndUpdate(
      { channelId: 'mock' },
      {
        puuid: user.puuid,
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
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    connection.ws.send({
      metadata: { type: "auth_complete" },
      payload: {
        puuid: user.puuid,
        gameName: user.gameName,
        tagLine: user.tagLine,
      },
    });

    connection.ws.close();

    return redirect("/#afterLogin");
  },
  {
    query: t.Object({
      state: t.String(),
      code: t.String(),
    }),
  }
);