import { Elysia, t } from "elysia";
import { unlinkSync } from 'fs';
import { redis } from "..";
import { Bug, User } from "../models";
import {
  PCRegions,
  ConsoleRegions,
  RiotRequestManager,
  checkDaily,
  checkMMR,
  checkMatchlist,
  checkPlayer,
} from "../lib";
import { isAuthorized } from "../middlewares";

export const Api = new Elysia({ prefix: "/api" });

Api.get(
  "/leaderboard/:platform/:region",
  async ({ set, params: { platform, region } }) => {
    const obj = {
      pc: PCRegions,
      console: ConsoleRegions,
    };

    if (
      !["pc", "console"].includes(platform) ||
      !obj[platform as "pc" | "console"].concat("global").includes(region)
    ) {
      set.status = 400;
      return { status: 400, error: "Invalid platform or region" };
    }

    let leaderboard: any[] = [];

    if (region === "global") {
      for (const reg of obj[platform as "pc" | "console"]) {
        const data = JSON.parse(
          (await redis.get(`leaderboard:${platform}:${reg}:total`)) as string
        );
        if (!data) continue;
        if (!leaderboard) {
          leaderboard = data;
        } else leaderboard = leaderboard.concat(data);
      }

      leaderboard.sort((a, b) => b.rankedRating - a.rankedRating);
    } else {
      leaderboard = JSON.parse(
        (await redis.get(`leaderboard:${platform}:${region}:total`)) as string
      );
    }

    const parsedLeaderboard = leaderboard.map((entry: any) => {
      const { puuid, leaderboardRank, ...rest } = entry;

      return {
        ...rest,
      };
    });

    return parsedLeaderboard;
  }
);


Api.get(
  "/players/:channelId",
  async ({ headers, set, params: { channelId } }) => {

    const payload = isAuthorized(headers)

    if(!payload){
      set.status = 401;
      return { status: 401, error: "Unauthorized" };
    }


    const { channel_id } = payload;

    if (channel_id !== channelId) {
      set.status = 401;
      return { status: 401, error: "Unauthorized" };
    }

    const data = await User.findOne({ channelId });

    if (!data) {
      set.status = 404;
      return { status: 404, error: "User not found" };
    }


    const { activeShard } = await RiotRequestManager.getAccountShard(
      data.puuid
    );

    if (data.region !== activeShard) {
      data.region = activeShard;
      await data.save();
    }

    const {
      data: matchlist,
      cached,
      riotMatchlist,
    } = await checkMatchlist(data.puuid, data.region, data.config.platform);

    set.status = 400;
    return { status: 200, channelId: payload.channel_id };


    /*
    if (!matchlist.data.length && !matchlist.competitiveMatches.length) {
      set.status = 404;
      return { status: 404, error: "No match history found." };
    }

    const mmr = await checkMMR(
      data.puuid,
      data.region,
      data.config.platform,
      matchlist.competitiveMatches
    );

    const player = await checkPlayer(
      matchlist.data[0] || matchlist.competitiveMatches[0],
      data.config.platform
    );

    if (data.username !== player.username || data.tag !== player.tagLine) {
      data.username = player.username;
      data.tag = player.tagLine;
      await data.save();
    }

    const daily = data.config.daily.enabled
      ? await checkDaily(
          data.puuid,
          data.region,
          data.config.platform,
          riotMatchlist!,
          data.config.daily.only_competitive
        )
      : null;

    set.headers["Cache"] = `${cached ? "HIT" : "MISS"}`;

    set.status = 200;

    return {
      matchlist: data.config.match_history ? matchlist.data : null,
      mmrHistory: data.config.match_history
        ? matchlist.competitiveMatches
        : null,
      daily,
      mmr,
      player,
    };
    */
  }
);

Api.get("/players/mock", async ({ set }) => {

  const user = await User.findOne({ channelId: "mock" });

  if (!user) {
    set.status = 404;
    return { status: 404, error: "User not found" };
  }
  const { activeShard } = await RiotRequestManager.getAccountShard(user.puuid);

  if (user.region !== activeShard) {
    user.region = activeShard;
    await user.save();
  }

  const {
    data: matchlist,
    cached,
    riotMatchlist,
  } = await checkMatchlist(user.puuid, user.region, user.config.platform);

  if (!matchlist.data.length && !matchlist.competitiveMatches.length) {
    set.status = 404;
    return { status: 404, error: "No match history found." };
  }

  const mmr = await checkMMR(
    user.puuid,
    user.region,
    user.config.platform,
    matchlist.competitiveMatches
  );

  const player = await checkPlayer(
    matchlist.data[0] || matchlist.competitiveMatches[0],
    user.config.platform
  );

  const daily = user.config.daily.enabled
    ? await checkDaily(
        user.puuid,
        user.region,
        user.config.platform,
        riotMatchlist!,
        user.config.daily.only_competitive
      )
    : null;

  set.headers["Cache"] = `${cached ? "HIT" : "MISS"}`;

  set.status = 200;

  return {
    matchlist: user.config.match_history ? matchlist.data : null,
    mmr,
    player,
    mmrHistory: user.config.match_history ? matchlist.competitiveMatches : null,
    daily,
  };
});

Api.get(
  "/setup",
  async ({ headers, set, query: { channel_id } }) => {

    const payload = isAuthorized(headers);

    if(!payload){
      set.status = 401;
      return { status: 401, error: "Unauthorized" };
    }

    const { channel_id: channelId } = payload;

    if (channel_id !== channelId) {
      set.status = 401;
      return { status: 401, error: "Unauthorized" };
    }

    const data = await User.findOne({ channelId });

    if (!data) {
      set.status = 404;
      return { status: 404, error: "User was not found" };
    }

    if (
      !data.platforms.includes("console") &&
      (await RiotRequestManager.getMatchlist(
        data.puuid,
        data.region,
        "console"
      ).catch(() => false))
    ) {
      data.platforms.push("console");
      await data.save();
    }

    if (
      !data.platforms.includes("pc") &&
      (await RiotRequestManager.getMatchlist(
        data.puuid,
        data.region,
        "pc"
      ).catch(() => false))
    ) {
      data.platforms.push("pc");
      await data.save();
    }

    try {
      const account = await RiotRequestManager.getValorantAccount(
        data.auth.access_token,
        data.auth.refresh_token
      );

      if (data.tag !== account.tagLine || data.username !== account.gameName) {
        data.tag = account.tagLine;
        data.username = account.gameName;
        await data.save();
      }
    } catch (e) {}

    const { auth, ...rest } = data.toObject({ versionKey: false });

    set.status = 200;

    return { status: 200, data: rest };
  },
  {
    query: t.Object({
      channel_id: t.String(),
    }),
  }
);

Api.put(
  "/setup",
  async ({ headers, set, body }) => {

    const payload = isAuthorized(headers);

    if(!payload){
      set.status = 401;
      return { status: 401, error: "Unauthorized" };
    }

    const { channel_id } = payload;

    if (body.channelId !== channel_id) {
      set.status = 401;
      return { status: 401, error: "Unauthorized" };
    }

    const data = await User.findOne({ channelId: body.channelId });

    if (!data) {
      set.status = 404;
      return { status: 404, error: "User was not found." };
    }

    if (
      !["pc", "console"].includes(body.platform) ||
      !data.platforms.includes(body.platform)
    ) {
      set.status = 400;
      return { status: 400, error: "Invalid platform." };
    }

    const shard = await RiotRequestManager.getAccountShard(data.puuid);

    if (shard.activeShard === "kr" && body.platform === "console") {
      set.status = 400;
      return {
        status: 400,
        error: "Korean shard is not supported in console.",
      };
    }

    try {
      const account = await RiotRequestManager.getValorantAccount(
        data.auth.access_token,
        data.auth.refresh_token
      );

      if (data.tag !== account.tagLine || data.username !== account.gameName) {
        data.tag = account.tagLine;
        data.username = account.gameName;
        await data.save();
      }
    } catch (e) {}

    await data.updateOne({
      region: shard.activeShard,
      config: {
        match_history: body.match_history,
        platform: body.platform,
        daily: body.daily,
      },
    });

    set.status = 200;
    return { status: 200, message: `Changes were saved sucessfully!` };
  },
  {
    body: t.Object({
      channelId: t.String(),
      platform: t.Union([t.Literal("pc"), t.Literal("console")]),
      match_history: t.Boolean(),
      daily: t.Object({
        enabled: t.Boolean(),
        only_competitive: t.Boolean(),
      }),
    })
  }
);

Api.delete(
  "/setup",
  async ({ headers, set }) => {

    const payload = isAuthorized(headers);

    if(!payload){
      set.status = 401;
      return { status: 401, error: "Unauthorized" };
    }

    const { channel_id } = payload;

    const data = await User.findOneAndDelete({
      channelId: channel_id,
    });

    if (!data) {
      set.status = 404;
      return { status: 404, error: "Not Found" };
    }

    set.status = 204;

    return;
  }
);

Api.post(
  "/report",
  async ({ server, request, body, set }) => {
    
    const { description, reproduction, frequency, captcha, screenshot } = body;

    const ip = server?.requestIP(request)?.address;

    const captchaResponse = await fetch(
      `https://api.hcaptcha.com/siteverify`,
      {
        method: "POST",
        body: new URLSearchParams({
          secret: process.env.HCAPTCHA_SECRET,
          remoteip: ip!,
          response: captcha
        }),
      }
    ).then((res) => res.json());

    if (!captchaResponse.success) {
      set.status = 400;
      return { status: 400, error: "Invalid captcha" };
    }

    if(screenshot && screenshot.size > 2e6){
      set.status = 400;
      return { status: 400, error: "Screenshot is too large" };
    }

    if(screenshot && !screenshot.type.startsWith("image/")){
      set.status = 400;
      return { status: 400, error: "Invalid screenshot type" };
    }

    set.status = 200;

    const bug = await Bug.create({
      description,
      reproduction,
      frequency,
      createdAt: new Date().toISOString()
    })

    if(screenshot){

      const path = `./public/reports/${Date.now()}_${screenshot.name}`;

      Bun.write(path, screenshot);

      bug.screenshot = path.split("/").slice(2).join("/");

      await bug.save();

    }

    return { status: 200, message: "Report was sent sucessfully!" };

  },
  {
    body: t.Object({
      description: t.String(),
      reproduction: t.String(),
      frequency: t.String(),
      captcha: t.String(),
      screenshot: t.Optional(t.File()),
    }),
  }
);

Api.get("/reports", async({ headers, set }) => {
  
  const entries = headers["authorization"]?.split(" ");

  if(!entries) {
    set.status = 401;
    return { status: 401, error: "Unauthorized" };
  }

  if(entries[0] !== "Basic"){
    set.status = 400;
    return { status: 400, error: "Invalid Authorization" };
  }

  const [username, password] = Buffer.from(entries[1], "base64").toString().split(":");

  if(username !== process.env.BUG_PANEL_USERNAME || password !== process.env.BUG_PANEL_PASSWORD){
    set.status = 401;
    return { status: 401, error: "Unauthorized" };
  }

  return await Bug.find();
})

Api.put("/reports/:id", async({ headers, set, params: { id }, body }) => {

  const entries = headers["authorization"]?.split(" ");

  if(!entries) {
    set.status = 401;
    return { status: 401, error: "Unauthorized" };
  }

  if(entries[0] !== "Basic"){
    set.status = 400;
    return { status: 400, error: "Invalid Authorization" };
  }

  const [username, password] = Buffer.from(entries[1], "base64").toString().split(":");

  if(username !== process.env.BUG_PANEL_USERNAME || password !== process.env.BUG_PANEL_PASSWORD){
    set.status = 401;
    return { status: 401, error: "Unauthorized" };
  }

  const bug = await Bug.findById(id);

  if(!bug){
    set.status = 404;
    return { status: 404, error: "Not Found" };
  }

  await bug.updateOne({ resolved: body.resolved });

  return { message: "Updated sucessfully!" };

}, {
  body: t.Object({
    resolved: t.Boolean()
  })
});

Api.delete("/reports/:id", async({ headers, set, params: { id } }) => {

  const entries = headers["authorization"]?.split(" ");

  if(!entries) {
    set.status = 401;
    return { status: 401, error: "Unauthorized" };
  }

  if(entries[0] !== "Basic"){
    set.status = 400;
    return { status: 400, error: "Invalid Authorization" };
  }

  const [username, password] = Buffer.from(entries[1], "base64").toString().split(":");

  if(username !== process.env.BUG_PANEL_USERNAME || password !== process.env.BUG_PANEL_PASSWORD){
    set.status = 401;
    return { status: 401, error: "Unauthorized" };
  }

  const bug = await Bug.findByIdAndDelete(id);

  if(!bug){
    set.status = 404;
    return { status: 404, error: "Not Found" };
  }

  if(bug.screenshot){
    unlinkSync('./public/' + bug.screenshot);
  }

  return { message: "Deleted sucessfully!" };

});