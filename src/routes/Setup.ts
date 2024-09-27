import { Router } from "express";
import { redis } from "..";
import {
  PostSetupRequestBody,
  PutSetupRequestBody,
  RequestManager,
} from "../lib";
import { User } from "../models";
import { createEntry } from "./Player";

const router = Router();

router.post("/", async (req, res) => {
  const body = req.body as PostSetupRequestBody;

  if (body.channelId !== req.payload.channel_id)
    return res.status(401).json({ status: 401, error: "Unauthorized" });

  if (!["pc", "console"].includes(body.platform))
    return res.status(400).json({ status: 400, error: "Invalid platform" });

  if (typeof body.match_history !== "boolean")
    return res
      .status(400)
      .json({ status: 400, error: "Invalid match history" });

  if (await User.exists({ channelId: body.channelId }))
    return res.status(400).json({ status: 400, error: "User already exists" });

  RequestManager.getValorantAccountByUsername(body.username, body.tag).then(
    async ({ data }) => {
      if (!data.platforms.includes(body.platform.toLowerCase()))
        return res
          .status(400)
          .json({
            status: 400,
            error:
              "The user has not ever played on the platform you specified.",
          });

      if (!Object.keys(await redis.hgetall(data.puuid)).length) {
        await createEntry(
          data.puuid,
          data.region,
          body.platform,
          body.match_history
        );
      }

      await User.create({
        channelId: body.channelId,
        puuid: data.puuid,
        region: data.region,
        username: data.name,
        tag: data.tag,
        match_history: body.match_history,
        platform: body.platform,
      });

      return res.status(200).json({
        status: 200,
        message: `${data.name}#${data.tag} was linked with this channel successfully!`,
      });
    },
    (err) => {
      return res.status(404).json({
        status: 404,
        error: `User ${body.username}#${body.tag} was not found.`,
      });
    }
  );
});

router.put("/", async (req, res) => {
  const body = req.body as PutSetupRequestBody;

  if (body.channelId !== req.payload.channel_id)
    return res.status(401).json({ status: 401, error: "Unauthorized" });

  const user = await User.findOne({ channelId: body.channelId });

  if (!user)
    return res.status(404).json({ status: 404, error: "User was not found." });

  if (!["pc", "console"].includes(body.platform))
    return res.status(400).json({ status: 400, error: "Invalid platform." });

  if (typeof body.match_history !== "boolean")
    return res
      .status(400)
      .json({ status: 400, error: "Invalid match history." });

  RequestManager.getValorantAccountByUsername(body.username, body.tag).then(
    async ({ data }) => {
      if (!data.platforms.includes(body.platform.toUpperCase()))
        return res
          .status(400)
          .json({
            status: 400,
            error:
              "The user has not ever played on the platform you specified.",
          });

      if (!Object.keys(await redis.hgetall(data.puuid)).length) {
        await createEntry(
          data.puuid,
          data.region,
          body.platform,
          body.match_history
        );
      }

      await user.updateOne({
        puuid: data.puuid,
        region: data.region,
        username: data.name,
        tag: data.tag,
        match_history: body.match_history,
        platform: body.platform,
      });

      return res
        .status(200)
        .json({ status: 200, message: `Changes were save sucessfully!` });
    },
    () => {
      return res.status(404).json({
        status: 404,
        error: `User ${body.username}#${body.tag} was not found.`,
      });
    }
  );
});

router.get<"/", any, any, any, { channel_id: string }>(
  "/",
  async (req, res) => {
    const { channel_id } = req.query;

    if (channel_id !== req.payload.channel_id)
      return res.status(401).json({ status: 401, error: "Unauthorized" });

    const user = await User.findOne(
      { channelId: channel_id },
      { _id: 0, __v: 0, puuid: 0, region: 0 }
    );

    if (!user)
      return res.status(404).json({ status: 404, error: "User was not found" });

    return res.status(200).json({ status: 200, data: user });
  }
);

export { router as Setup };
