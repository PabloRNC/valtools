import { Router } from "express";
import { redis } from "..";

const router = Router();

router.get("/", async(_req, res) => {

    const data = await redis.hgetall('bd43bd80-261d-5bac-a8c5-7fcab9f35df1');

    return res.status(200).json({ status: 200, data:  { mmr: JSON.parse(data.mmr_console), mmrHistory: JSON.parse(data.mmrHistory_console), player: JSON.parse(data.player), matchlist: JSON.parse(data.matchlist_console), matchHistory: true }});

});

export { router as Example };