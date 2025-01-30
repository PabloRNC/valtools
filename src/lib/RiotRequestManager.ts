import type {
  RiotGetAccountShard,
  RiotGetLeaderboardResponse,
  RiotGetMatchResponse,
  RiotGetResponses,
  RiotGetValorantAccount,
  RiotGetValorantContent,
  RiotGetValorantMatchlist,
} from "./types";
import { RSORequestManager } from "./RSORequestManager";
import { parseURL } from "./ParseURL";
import { User } from "../models";

export class RiotRequestManager {
  public static async get<T extends RiotGetResponses>(
    endpoint: string,
    region: string,
    params?: URLSearchParams | null,
    auth?: { accessToken: string; refreshToken: string },
    refreshed = false
  ): Promise<T> {
    const response = await fetch(
      parseURL(process.env.RIOT_BASE_URL, region) +
        endpoint +
        (params ? `?${params?.toString()}` : ""),
      { method: "GET", headers: this.makeHeaders(auth?.accessToken) }
    );

    if(process.env.DEBUG) console.log(`Request made to ${response.url} with status ${response.status}`);

    if (!response.ok) {
      if (auth && !refreshed && response.status === 401) {
        const newToken = await RSORequestManager.refreshToken(
          auth.refreshToken
        );
        await User.updateOne(
          { "auth.access_token": auth.accessToken },
          {
            "auth.access_token": newToken.access_token,
            "auth.refresh_token": newToken.refresh_token,
          }
        );
        return await this.get(
          endpoint,
          region,
          params,
          {
            accessToken: newToken.access_token,
            refreshToken: newToken.refresh_token,
          },
          true
        );
      }

      throw new Error(
        `${response.statusText}\nURL: ${response.url}\nStatus: ${
          response.status
        }\n${await response.text()}`
      );
    }

    return await response.json();
  }

  public static async getValorantAccount(
    accessToken: string,
    refreshToken: string
  ) {
    return await this.get<RiotGetValorantAccount>(
      `riot/account/v1/accounts/me`,
      "europe",
      null,
      { accessToken, refreshToken }
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

  public static async getActId(region: string) {
    const content = await this.get<RiotGetValorantContent>(
      "val/content/v1/contents",
      region
    );
    return content.acts.find((act) => act.isActive)!.id;
  }

  public static async getMatchlist(
    puuid: string,
    region: string,
    platform: "pc" | "console"
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
    });

    if (!token) headers.set("X-Riot-Token", process.env.RIOT_API_KEY!);

    if (token) headers.set("Authorization", `Bearer ${token}`);

    return headers;
  }
}
