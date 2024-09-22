export type Redis<T> = {
    data: T;
    updateAt: number;
}

export interface RedisMatchlist {
    agent: { name: string, id: string };
    map: { name: string, id: string };
    cluster: string;
    mode: string;
    isDeathmatch: boolean;
    score: string;
    kills: number;
    deaths: number;
    assists: number;
    headshots: string;
    bodyshots: string;
    legshots: string;
}

export interface RedisMMR {
    tier: { id: string, name: string };
    rr: number;
    leaderboard_rank: number | null; 
    account: { puuid: string, name: string, tag: string };
}