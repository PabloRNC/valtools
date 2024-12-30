export type RiotGetResponses = RiotGetValorantAccount | RiotGetValorantMatchlist | RiotGetMatchResponse | RiotGetValorantContent | RiotGetLeaderboardResponse | RiotGetAccountShard; 


export interface RiotGetValorantContent {
    acts: Act[];
}

export interface Act {
    name: string;
    id: string;
    isActive: boolean;   
}

export interface RiotGetValorantAccount {
    puuid: string;
    gameName: string;
    tagLine: string;
}

export interface RiotGetValorantMatchlist {
    puuid: string;
    history: BaseMatch[];
}

export interface BaseMatch {
    matchId: string;
    gameStartTimeMillis: number;
    queueId: string;
}

export interface RiotGetMatchResponse {
    matchInfo: MatchInfo;
    players: Player[];
    roundResults: Round[];
    teams: Team[];
}

export interface MatchInfo {
    matchId: string;
    mapId: string;
    gameLengthMillis: number;
    gameStartMillis: number;
    provisioningFlowId: string;
    isCompleted: boolean;
    customGameName: string;
    queueId: string;
    gameMode: string;
    isRanked: boolean;
    seasonId: string;
}

export interface Player {
    puuid: string;
    gameName: string;
    tagLine: string;
    teamId: string;
    partyId: string;
    characterId: string;
    stats: Stats;
    competitiveTier: number;
    playerCard: string;
    playerTitle: string;
    accountLevel: number;
}


export interface Stats {
    score: number;
    roundsPlayed: number;
    kills: number;
    deaths: number;
    assists: number;
    playtimeMillis: number;
    abilityCasts: AbilityCasts;
}

export interface AbilityCasts {
    grenadeCasts: number;
    ability1Casts: number;
    ability2Casts: number;
    ultimateCasts: number;
}

export interface Team {
    teamId: string;
    won: boolean;
    roundsPlayed: number;
    roundsWon: number;
    numPoints: number;
}

export interface Round {
    roundNum: number;
    roundResult: string;
    roundCeremony: string;
    winningTeam: string;
    bombPlanter: string;
    bombDefuser: string;
    plantRoundTime: number;
    plantPlayerLocations: PlayerLocation[];
    plantLocation: Location;
    defuseRoundTime: number;
    defusePlayerLocations: PlayerLocation[];
    defuseLocation: Location;
    playerStats: PlayerStats[];
    roundResultCode: string;
}

export interface PlayerLocation {
    puuid: string;
    viewRadians: number;
    location: Location;
}

export interface Location {
    x: number;
    y: number;
}

export interface PlayerStats {
    puuid: string;
    kills: number;
    damage: Damage[];
    score: number;
    economy: Economy;
}

export interface Kill {
    timeSinceGameStartMillis: number;
    timeSinceRoundStartMillis: number;
    killer: string;
    victim: string;
    victimLocation: Location;
    assistants: string[];
    playerLocations: PlayerLocation[];
    finishingDamage: FinishingDamage;
}

export interface FinishingDamage {
    damageType: string;
    damageItem: string;
    isSecondaryFireMode: boolean;
}

export interface Damage {
    receiver: string;
    damage: number;
    legshots: number;
    bodyshots: number;
    headshots: number;
}

export interface Economy {
    loadoutValue: number;
    weapon: string;
    armor: string;
    remaining: number;
    spent: number;
}


export interface RiotGetLeaderboardResponse {
    shard: string;
    actId: string;
    totalPlayers: number;
    players: LeaderboardPlayer[];
    immortalStartingPage: number;
    immortalStartingIndex: number;
    topTierRRThreshold: number;
    tierDetails: TierDetails;
}

export interface LeaderboardPlayer {
    puuid: string;
    gameName: string;
    tagLine: string;
    leaderboardRank: number;
    rankedRating: number;
    numberOfWins: number;
}

export interface TierDetails {
    '24': TierDetail;
    "25": TierDetail;
    "26": TierDetail;
    "27": TierDetail;
}

export interface TierDetail {
    rankedRatingThreshold: number;
    startingPage: number;
    startingIndex: number;
}

export interface RiotGetAccountShard {
    puuid: string;
    activeShard: string;
    game: 'val'
}