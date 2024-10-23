import { RSOPostAuthCodeResponse } from './types';
import 'dotenv/config';

export class RSORequestManager {

    public static async getToken(code: string, redirect_uri: string = process.env.RSO_REDIRECT_URI) {

        const body = new URLSearchParams();

        body.append('grant_type', 'authorization_code');
        body.append('code', code);
        body.append('redirect_uri', redirect_uri);

        const response = await fetch(process.env.RSO_BASE_URL + 'token', { method: 'POST', body, headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.RSO_CLIENT_ID}:${process.env.RSO_CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }})

        if(!response.ok) throw new Error(`${response.statusText}\nURL: ${response.url}\nStatus: ${response.status}\n${await response.text()}`);

        return await response.json() as RSOPostAuthCodeResponse;

    }

    public static async refreshToken(refreshToken: string) {

        const body = new URLSearchParams();

        console.log(refreshToken)

        body.append('grant_type', 'refresh_token');
        body.append('refresh_token', refreshToken);

        const response = await fetch(process.env.RSO_BASE_URL + 'token', { method: 'POST', body, headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.RSO_CLIENT_ID}:${process.env.RSO_CLIENT_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }})

        if(!response.ok) throw new Error(`${response.statusText}\nURL: ${response.url}\nStatus: ${response.status}\n${await response.text()}\n${body}`);

        return await response.json() as RSOPostAuthCodeResponse;

    }

}