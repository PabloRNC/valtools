export type Redis<T> = {
    data: T;
    updateAt: number;
}

export interface RedisMatchlist {
    id: string;
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
    won: boolean;
    acs: number;
    mvp: boolean;
    teamMvp: boolean;
}

export interface RedisMMR {
    tier: { id: string, name: string };
    rr: number;
    leaderboard_rank: number | null; 
    account: { puuid: string, name: string, tag: string };
}

export interface RedisMMRHistory extends RedisMatchlist {
    tierAfterUpdate: number;
    tierBeforeUpdate: number;
    rrChange: number;
}