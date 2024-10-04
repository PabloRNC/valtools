import 'dotenv/config';
import { GetResponses, GetValorantAccountByUsernameResponse, GetValorantAccountByPuuidResponse, GetMatchListResponse, GetMMRResponse, GetMatchResponse } from "./types/GetResponses";
import { PostMMRHistoryRawResponse, PostResponses } from './types/PostResponses';
import { ResponseParser } from './types/ResponseParser';
import { APIBody, PostMMRHistoryRawBody } from './types/APIBody';

export class RequestManager {

 
    public static async get<T extends GetResponses>(endpoint: string, params?: URLSearchParams): Promise<ResponseParser<T>> {
        const response = await fetch(process.env.BASE_URL + endpoint + (params? `?${params?.toString()}` : ''), { method: 'GET', headers: this.makeHeaders() });
        if(!response.ok) {
            console.error(new Error(`${response.statusText}\nURL: ${response.url}\nStatus: ${response.status}\n${await response.text()}`));
            return { headers: response.headers, status: response.status } as any;
        }
        return { ...await response.json(), headers: response.headers } ;
    }

    public static async post<T extends PostResponses>(endpoint: string, body: APIBody): Promise<T & { headers: Headers, status: number }> {
        const response = await fetch(process.env.BASE_URL + endpoint, { method: 'POST', headers: this.makeHeaders(), body: JSON.stringify(body) });
        if(!response.ok) {
            console.error(new Error(`${response.statusText}\nURL: ${response.url}\nStatus: ${response.status}\n${await response.text()}`));
            return { headers: response.headers, status: response.status } as any;
        }
        return { ...await response.json(), headers: response.headers, status: response.status };
    }

    public static async getValorantAccountByUsername(username: string, tag: string) {
        return await this.get<GetValorantAccountByUsernameResponse>(`v2/account/${username}/${tag}`);
    }

    public static async getValorantAccountByPuuid(puuid: string) {
        return await this.get<GetValorantAccountByPuuidResponse>(`v2/by-puuid/account/${puuid}`);
    }

    public static async getMatchList(puuid: string, region: string, platform: 'console' | 'pc'){
        return await this.get<GetMatchListResponse[]>(`v4/by-puuid/matches/${region}/${platform}/${puuid}`, new URLSearchParams({ size: '10' }));
    }

    public static async getMMR(puuid: string, region: string, platform: 'console' | 'pc'){
        return await this.get<GetMMRResponse>(`v3/by-puuid/mmr/${region}/${platform}/${puuid}`);
    }

    public static async getMMRHistory(puuid: string, region: string, platform: 'console' | 'pc'){
        return await this.post<PostMMRHistoryRawResponse>('v1/raw', { value: puuid, type: 'competitiveupdates', region, platform, queries: `?queue=${platform === 'console' ? 'console_competitive' : 'competitive' }`});
    }

    public static async getMatch(matchId: string, region: string){
        return await this.get<GetMatchResponse>(`v4/match/${region}/${matchId}`);
    }

    private static makeHeaders(): Headers {
        return new Headers({
            'Content-Type': 'application/json',
            'Authorization': process.env.API_KEY
        });
    }
}