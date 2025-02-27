export type Redis<T> = {
  data: T;
  updateAt: number;
};

export interface RedisMatchlist {
  timestamp: Date;
  id: string;
  agentId: string;
  mapId: string;
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
  competitiveTier: number;
  puuid: string;
  playerCard: string;
  username: string;
  tagLine: string;
  accountLevel: number;
  seasonId: string;
  queueId: string;
}

export interface RedisMMR {
  tier: number;
  rr: number | null;
  leaderboard_rank: number | null;
  threshold: number | null;
}

export interface RedisPlayer {
  puuid: string;
  tagLine: string;
  accountLevel: number;
  playerCard: string;
}

export interface RedisDaily {
  won: number;
  lost: number;
  streak: number;
  status: {
    [key: string]: boolean | 'tied';
  }
}
