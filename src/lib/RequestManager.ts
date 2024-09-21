import 'dotenv/config';
import { GetResponses, ResponseParser, GetRiotAccountByUsernameResponse, GetRiotAccountByPuuidResponse } from "./types";


export class RequestManager {

 
    public static async get(endpoint: string, params?: URLSearchParams): Promise<ResponseParser<GetResponses>> {
        const response = await fetch(process.env.BASE_URL + endpoint + (params? `?${params?.toString()}` : ''), { method: 'GET', headers: this.makeHeaders() });
        if(!response.ok) throw new Error(response.statusText);
        return await response.json();
    }

    public static async getRiotAccountByUsername(username: string, tag: string): Promise<GetRiotAccountByUsernameResponse> {
        const response = await this.get(`v2/account/${username}/${tag}`);
        return response.data as GetRiotAccountByUsernameResponse;
    }

    public static async getRiotAccountByPuuid(puuid: string): Promise<GetRiotAccountByPuuidResponse> {
        const response = await this.get(`v2/account/${puuid}`);
        return response.data as GetRiotAccountByPuuidResponse;
    }

    private static makeHeaders(): Headers {
        return new Headers({
            'Content-Type': 'application/json',
            'Authorization': process.env.API_KEY
        });
    }
}