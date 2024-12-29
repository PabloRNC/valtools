import { Router } from "express";
import { PutSetupRequestBody, RiotRequestManager } from "../lib";
import { User } from "../models";

const router = Router();

router.put("/", async (req, res) => {
  const body = req.body as PutSetupRequestBody;

  if (body.channelId !== req.payload.channel_id)
    return res.status(401).json({ status: 401, error: "Unauthorized" });

  const user = await User.findOne({ channelId: body.channelId });

  if (!user)
    return res.status(404).json({ status: 404, error: "User was not found." });

  if (
    !["pc", "console"].includes(body.platform) ||
    !user.platforms.includes(body.platform)
  )
    return res.status(400).json({ status: 400, error: "Invalid platform." });

  if (typeof body.match_history !== "boolean")
    return res
      .status(400)
      .json({ status: 400, error: "Invalid match history." });

  const shard = await RiotRequestManager.getAccountShard(user.puuid);

  if (shard.activeShard === "kr" && body.platform === "console")
    return res.status(400).json({
      status: 400,
      error: "Korean shard is not supported in console.",
    });

  try {
    const account = await RiotRequestManager.getValorantAccount(
      user.auth.access_token,
      user.auth.refresh_token
    );

    if (user.tag !== account.tagLine || user.username !== account.gameName) {
      user.tag = account.tagLine;
      user.username = account.gameName;
      await user.save();
    }
  } catch (e) {}

  await user.updateOne({
    region: shard.activeShard,
    config: {
      match_history: body.match_history,
      platform: body.platform,
      daily: body.daily,
    },
  });

  return res
    .status(200)
    .json({ status: 200, message: `Changes were saved sucessfully!` });
});

router.get<"/", any, any, any, { channel_id: string }>(
  "/",
  async (req, res) => {
    const { channel_id } = req.query;

    if (channel_id !== req.payload.channel_id)
      return res.status(401).json({ status: 401, error: "Unauthorized" });

    const user = await User.findOne({ channelId: channel_id });

    if (!user)
      return res.status(404).json({ status: 404, error: "User was not found" });

    if (
      !user.platforms.includes("console") &&
      (await RiotRequestManager.getMatchlist(
        user.puuid,
        user.region,
        "console"
      ).catch(() => false))
    ) {
      user.platforms.push("console");
      await user.save();
    }

    if (
      !user.platforms.includes("pc") &&
      (await RiotRequestManager.getMatchlist(
        user.puuid,
        user.region,
        "pc"
      ).catch(() => false))
    ) {
      user.platforms.push("pc");
      await user.save();
    }

    const account = await RiotRequestManager.getValorantAccount(
      user.auth.access_token,
      user.auth.refresh_token
    );

    if (user.tag !== account.tagLine || user.username !== account.gameName) {
      user.tag = account.tagLine;
      user.username = account.gameName;
      await user.save();
    }

    const { auth, ...rest } = user.toObject({ versionKey: false });

    return res.status(200).json({ status: 200, data: rest });
  }
);

router.delete("/", async (req, res) => {
  const user = await User.findOneAndDelete({
    channelId: req.payload.channel_id,
  });

  if (!user) {
    return res.status(404).json({ status: 404, error: "Not Found" });
  }

  return res.sendStatus(200);
});

export { router as Setup };
