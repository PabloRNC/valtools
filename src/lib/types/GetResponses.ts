export type GetResponses = GetRiotAccountByUsernameResponse;

export interface GetRiotAccountByUsernameResponse {
    puuid:         string;
    region:        string;
    account_level: number;
    name:          string;
    tag:           string;
    card:          string;
    title:         string;
    platforms:     string[];
    updated_at:    string
}

export interface GetRiotAccountByPuuidResponse {
    puuid:         string;
    region:        string;
    account_level: number;
    name:          string;
    tag:           string;
    card:          string;
    title:         string;
    platforms:     string[];
    updated_at:    string
}