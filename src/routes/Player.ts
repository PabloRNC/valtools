import { Router } from "express";
import { User } from "../models";
import {
  RedisMatchlist,
  RiotRequestManager,
  RiotGetValorantMatchlist,
} from "../lib";

const router = Router();

router.get("/:channel_id", async (req, res) => {
  const { channel_id } = req.params;

  const user = await User.findOne({ channelId: channel_id });

  if (!user)
    return res.status(404).json({ status: 404, error: "User not found" });

    const matchlist = await checkMatchlist(user.puuid, user.region, user.platform);

    if(!matchlist.data.length && !matchlist.competitiveMatches.length) return res.status(404).json({ status: 404, error: "No match history found" });

    const mmrHistory = await checkMMRHistory(user.puuid, user.region, user.platform, matchlist.competitiveMatches);

    const mmr = await checkMMR(user.puuid, user.region, user.platform, mmrHistory);

    const player = await checkPlayer(matchlist.data[0] || mmrHistory[0]);

    res.json({ matchlist: user.match_history ? matchlist.data : null, mmr, player, mmrHistory: user.match_history ? mmrHistory : null });
});

export async function checkMatchlist(
  puuid: string,
  region: string,
  platform: "pc" | "console",
) {

    const data = await RiotRequestManager.getMatchlist(puuid, region, platform);

    const accData = [] as RedisMatchlist[];

    for (const match of data.history.filter((x) => x.queueId !== parseQueue('competitive', platform)).slice(0, 3)) {
      const matchData = await RiotRequestManager.getMatch(
        match.matchId,
        region,
        platform
      );

      const player = matchData.players.find((x) => x.puuid === puuid)!;

      const isDeathmatch =
        matchData.matchInfo.queueId === parseQueue("deathmatch", platform);

      const team = matchData.teams.find((x) => x.teamId === player.teamId)!;

      const score = isDeathmatch
        ? player.stats.kills.toString()
        : `${team.roundsWon} - ${team.roundsPlayed - team.roundsWon}`;

      const damage = matchData.roundResults.reduce(
        (
          acc: { headshots: number; bodyshots: number; legshots: number },
          x
        ) => {
          const pStats = x.playerStats.find((_) => _.puuid === puuid)!;
          for(const d of pStats.damage) {
          acc.headshots += d.headshots;
          acc.bodyshots += d.bodyshots;
          acc.legshots += d.legshots;
          }
          return acc;
        },
        { headshots: 0, bodyshots: 0, legshots: 0 }
      );

      const shots = damage.headshots + damage.bodyshots + damage.legshots;

      const allScores = matchData.players.sort(
        (a, b) => b.stats.score - a.stats.score
      );

      accData.push({
        id: match.matchId,
        agentId: player.characterId,
        mapId: matchData.matchInfo.mapId,
        mode: matchData.matchInfo.gameMode,
        isDeathmatch,
        score,
        kills: player.stats.kills,
        deaths: player.stats.deaths,
        assists: player.stats.assists,
        headshots: (damage.headshots / shots).toFixed(2),
        bodyshots: (damage.bodyshots / shots).toFixed(2),
        legshots: (damage.legshots / shots).toFixed(2),
        won: team.won,
        acs: Math.round(player.stats.score / team.roundsPlayed),
        mvp: isDeathmatch ? false : allScores[0].puuid === puuid,
        teamMvp: isDeathmatch
          ? false
          : allScores.filter((x) => x.teamId === team.teamId)[0].puuid ===
            puuid,
        competitiveTier: player.competitiveTier,
        puuid: player.puuid,
        playerCard: player.playerCard,
        tagLine: player.tagLine,
        accountLevel: player.accountLevel,
      });
    }


    return {
      data: accData,
      competitiveMatches: data.history
        .filter(
          (x) =>
            x.queueId === parseQueue("competitive", platform)
        )
        .slice(0, 3),
    };
}

export async function checkMMR(
  puuid: string,
  region: string,
  platform: "pc" | "console",
  matchlist: RedisMatchlist[],
) {
    let leaderboardData: {
      rr: number;
      threshold: number | null;
      placement: number;
    } | null = null;

    const tier = matchlist[0].competitiveTier;

    if (tier >= 24) {
      const leaderboard = await RiotRequestManager.getLeaderboard(
        1,
        1,
        region,
        platform
      );

      if (leaderboard.players[0].puuid === puuid) {
        leaderboardData = {
          rr: leaderboard.players[0].rankedRating,
          threshold:
            tier < 27
              ? leaderboard.tierDetails[tier as 24 | 25 | 26 | 27]
                  .rankedRatingThreshold
              : null,
          placement: 1,
        };
      } else {
        let index =
        leaderboard.tierDetails[tier as 24 | 25 | 26 | 27].startingIndex;

        while (!leaderboardData) {
          const players = await RiotRequestManager.getLeaderboard(
            200,
            index,
            region,
            platform
          );

          const player = players.players.find((x) => x.puuid === puuid);

          if (player) {
            leaderboardData = {
              rr: player.rankedRating,
              threshold: tier < 27 ? leaderboard.tierDetails[tier + 1 as 24 | 25 | 26 | 27].rankedRatingThreshold : null,
              placement: player.leaderboardRank,
            };

            break;
          } else {
            index += 200;

            if (index > leaderboard.totalPlayers) break;
          }
        }
      }
    }

    return {
        tier,
        rr: leaderboardData?.rr ?? null,
        leaderboard_rank: leaderboardData?.placement ?? null,
        threshold: leaderboardData?.threshold ?? null,
    }
}

export async function checkMMRHistory(
  puuid: string,
  region: string,
  platform: "pc" | "console",
  matches: RiotGetValorantMatchlist["history"],
) {

    const accData: RedisMatchlist[] = [];

    for (const match of matches) {

      const matchData = await RiotRequestManager.getMatch(
        match.matchId,
        region,
        platform
      );

      const player = matchData.players.find((x) => x.puuid === puuid)!;

      const team = matchData.teams.find((x) => x.teamId === player.teamId)!;

      const score = `${team.roundsWon} - ${team.roundsPlayed - team.roundsWon}`;

      const damage = matchData.roundResults.reduce(
        (
          acc: { headshots: number; bodyshots: number; legshots: number },
          x
        ) => {
          const pStats = x.playerStats.find((_) => _.puuid === puuid)!;
          for(const d of pStats.damage) {
          acc.headshots += d.headshots;
          acc.bodyshots += d.bodyshots;
          acc.legshots += d.legshots;
          }
          return acc;
        },
        { headshots: 0, bodyshots: 0, legshots: 0 }
      );

      const shots = damage.headshots + damage.bodyshots + damage.legshots;

      const allScores = matchData.players.sort(
        (a, b) => b.stats.score - a.stats.score
      );

      accData.push({
        id: match.matchId,
        agentId: player.characterId,
        mapId: matchData.matchInfo.mapId,
        mode: matchData.matchInfo.gameMode,
        isDeathmatch: false,
        score,
        kills: player.stats.kills,
        deaths: player.stats.deaths,
        assists: player.stats.assists,
        headshots: (damage.headshots / shots).toFixed(2),
        bodyshots: (damage.bodyshots / shots).toFixed(2),
        legshots: (damage.legshots / shots).toFixed(2),
        won: team.won,
        acs: Math.round(player.stats.score / team.roundsPlayed),
        mvp: allScores[0].puuid === puuid,
        teamMvp: allScores.filter((x) => x.teamId === team.teamId)[0].puuid ===
            puuid,
        competitiveTier: player.competitiveTier,
        puuid: player.puuid,
        playerCard: player.playerCard,
        tagLine: player.tagLine,
        accountLevel: player.accountLevel,
      });
    }

    return accData;
}

export async function checkPlayer(data: RedisMatchlist){

       return {
            puuid: data.puuid,
            tagLine: data.tagLine,
            accountLevel: data.accountLevel,
            playerCard: data.playerCard,
        }
}

export function parseQueue(queue: string, platform: string){
  return `${platform === "console" ? "console_" : ""}${queue}`;
}

export { router as Player };