import {
  RiotGetAccountShard,
  RiotGetLeaderboardResponse,
  RiotGetMatchResponse,
  RiotGetResponses,
  RiotGetValorantAccount,
  RiotGetValorantContent,
  RiotGetValorantMatchlist,
} from "./types";
import { parseURL } from "./ParseURL";
import "dotenv/config";

export class RiotRequestManager {
  public static async get<T extends RiotGetResponses>(
    endpoint: string,
    region: string,
    params?: URLSearchParams | null,
    token?: string
  ): Promise<T> {
    const response = await fetch(
      parseURL(process.env.RIOT_BASE_URL, region) +
        endpoint +
        (params ? `?${params?.toString()}` : ""),
      { method: "GET", headers: this.makeHeaders(token) }
    );

    if (!response.ok)
      throw new Error(
        `${response.statusText}\nURL: ${response.url}\nStatus: ${
          response.status
        }\n${await response.text()}`
      );

    return await response.json();
  }

  public static async getValorantAccount(token: string) {
    return await this.get<RiotGetValorantAccount>(
      `riot/account/v1/accounts/me`,
      "europe",
      null,
      token
    );
  }

  public static async getValorantAccountByUsername(
    username: string,
    tag: string
  ) {
    return await this.get<RiotGetValorantAccount>(
      `riot/account/v1/accounts/by-riot-id/${username}/${tag}`,
      "europe"
    );
  }

  public static async getAccountShard(puuid: string) {
    return await this.get<RiotGetAccountShard>(
      `riot/account/v1/active-shards/by-game/val/by-puuid/${puuid}`,
      "europe"
    );
  }

  public static async getMatchlist(
    puuid: string,
    region: string,
    platform: "pc" | "console",
  ) {
    const params = new URLSearchParams({ platformType: "playstation" });

    const data = await this.get<RiotGetValorantMatchlist>(
      `val/match${
        platform === "console" ? "/console" : ""
      }/v1/matchlists/by-puuid/${puuid}`,
      region,
      platform === "console" ? params : null
    );

    data.history.sort((a, b) => b.gameStartTimeMillis - a.gameStartTimeMillis);
    return data;
  }

  public static async getMatch(
    matchId: string,
    region: string,
    platform: "pc" | "console"
  ) {
    return await this.get<RiotGetMatchResponse>(
      `val/match${
        platform === "console" ? "/console" : ""
      }/v1/matches/${matchId}`,
      region
    );
  }

  public static async getLeaderboard(
    size: number,
    startIndex: number,
    region: string,
    platform: "pc" | "console",
    actId: string
  ) {
    const params = new URLSearchParams({
      size: size.toString(),
      startIndex: startIndex.toString(),
    });

    if (platform === "console") params.set("platformType", "playstation");

    return await this.get<RiotGetLeaderboardResponse>(
      `val/${
        platform === "console" ? "console/" : ""
      }ranked/v1/leaderboards/by-act/${actId}`,
      region,
      params
    );
  }
  private static makeHeaders(token?: string): Headers {
    const headers = new Headers({
      "Content-Type": "application/json",
      "X-Riot-Token": process.env.RIOT_API_KEY,
    });

    if (token) headers.set("Authorization", `Bearer ${token}`);

    return headers;
  }
}
