import { RSOPostAuthCodeResponse } from './types';
import 'dotenv/config';

export class RSORequestManager {

    public static async getToken(code: string) {

        const body = new FormData();

        body.append('grant_type', 'authorization_code');
        body.append('code', code);
        body.append('redirect_uri', process.env.RSO_REDIRECT_URI);

        const response = await fetch(process.env.RSO_BASE_URL + 'token', { method: 'POST', body, headers: {
            'Authorization': `Basic ${Buffer.from(`${process.env.RSO_CLIENT_ID}:${process.env.RSO_CLIENT_SECRET}`).toString('base64')}`
        }})

        if(!response.ok) throw new Error(`${response.statusText}\nURL: ${response.url}\nStatus: ${response.status}\n${await response.text()}`);

        return await response.json() as RSOPostAuthCodeResponse;

    }

}