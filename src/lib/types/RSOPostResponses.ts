export type RSOPostResponses = RSOPostAuthCodeResponse;

export interface RSOPostAuthCodeResponse {
    scope: string;
    token_type: string;
    expires_in: number;
    access_token: string;
    refresh_token: string;
    id_token: string;
    sub_sid: string;
}