import 'dotenv/config';
import { GetResponses, ResponseParser, GetValorantAccountByUsernameResponse, GetValorantAccountByPuuidResponse, GetMatchListResponse, GetMMRResponse } from "./types";


export class RequestManager {

 
    public static async get<T extends GetResponses>(endpoint: string, params?: URLSearchParams): Promise<ResponseParser<T>> {
        const response = await fetch(process.env.BASE_URL + endpoint + (params? `?${params?.toString()}` : ''), { method: 'GET', headers: this.makeHeaders() });
        if(!response.ok) {
            throw new Error(`${response.statusText}\nURL: ${response.url}\nStatus: ${response.status}\n${await response.text()}`);
        }
        return { ...await response.json(), headers: response.headers } ;
    }

    public static async getValorantAccountByUsername(username: string, tag: string) {
        return await this.get<GetValorantAccountByUsernameResponse>(`v2/account/${username}/${tag}`);
    }

    public static async getValorantAccountByPuuid(puuid: string) {
        return await this.get<GetValorantAccountByPuuidResponse>(`v2/by-puuid/account/${puuid}`);
    }

    public static async getMatchList(puuid: string, region: string, platform: 'console' | 'pc'){
        return await this.get<GetMatchListResponse[]>(`v4/by-puuid/matches/${region}/${platform}/${puuid}`, new URLSearchParams({ size: '1000' }));
    }

    public static async getMMR(puuid: string, region: string, platform: 'console' | 'pc'){
        return await this.get<GetMMRResponse>(`v3/by-puuid/mmr/${region}/${platform}/${puuid}`);
    }

    /*public static async getMMRHistory(puuid: string, region: string, platform: 'console' | 'pc'){
        return await this.get<GetMMRResponse[]>(`v3/by-puuid/mmr-history/${region}/${platform}/${puuid}`);
    }*/

    private static makeHeaders(): Headers {
        return new Headers({
            'Content-Type': 'application/json',
            'Authorization': process.env.API_KEY
        });
    }
}