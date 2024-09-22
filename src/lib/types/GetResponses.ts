export type GetResponses =
  | GetValorantAccountByUsernameResponse
  | GetValorantAccountByPuuidResponse
  | GetMatchListResponse[]
  | GetMMRResponse;

export interface GetValorantAccountByUsernameResponse {
  puuid: string;
  region: string;
  account_level: number;
  name: string;
  tag: string;
  card: string;
  title: string;
  platforms: string[];
  updated_at: string;
}

export interface GetValorantAccountByPuuidResponse {
  puuid: string;
  region: string;
  account_level: number;
  name: string;
  tag: string;
  card: string;
  title: string;
  platforms: string[];
  updated_at: string;
}

export interface GetMatchListResponse {
  metadata: Metadata;
  players: Player[];
  observers: Observer[];
  coaches: Coach[];
  teams: Team[];
  rounds: Round[];
  kills: Kill[];
}

export interface Coach {
  puuid: string;
  team_id: string;
}

export interface Kill {
  killer: Killer;
  victim: Killer;
  assistants: Killer[];
  location: Location;
  weapon: Weapon;
  secondary_fire_mode: boolean;
  player_locations: Killer[];
}

export interface Killer {
  puuid: string;
  name: string;
  tag: string;
  team: string;
  location?: Location;
}

export interface Location {
  x: number;
  y: number;
}

export interface Weapon {
  id: string;
  name: string;
  type: string;
}

export interface Metadata {
  match_id: string;
  map: Map;
  game_version: string;
  started_at: string;
  is_completed: boolean;
  queue: Queue;
  season: Season;
  platform: string;
  party_rr_penaltys: PartyRrPenalty[];
  region: string;
  cluster: string;
}

export interface Map {
  id: string;
  name: string;
}

export interface PartyRrPenalty {
  party_id: string;
}

export interface Queue {
  id: string;
  name: string;
  mode_type: string;
}

export interface Season {
  id: string;
  short: string;
}

export interface Observer {
  puuid: string;
  name: string;
  tag: string;
  card_id: string;
  title_id: string;
  party_id: string;
}

export interface Player {
  puuid: string;
  name: string;
  tag: string;
  team_id: string;
  platform: string;
  party_id: string;
  agent: Map;
  stats: Stats;
  ability_casts: Location;
  tier: Tier;
  card_id: string;
  title_id: string;
  prefered_level_border: string;
  behavior: Behavior;
  economy: PlayerEconomy;
}

export interface Behavior {
  friendly_fire: Location;
}

export interface PlayerEconomy {
  spent: Location;
  loadout_value: Location;
}

export interface Stats {
  score: number
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  legshots: number;
  bodyshots: number;
  damage: { dealt: number, received: number };
}

export interface Tier {
  name: string;
}

export interface Round {
  result: string;
  ceremony: string;
  winning_team: string;
  plant: Defuse;
  defuse: Defuse;
  stats: Stat[];
}

export interface Defuse {
  location: Location;
  player: Killer;
  player_locations: Killer[];
  site?: string;
}

export interface Stat {
  ability_casts: Location;
  player: Killer;
  damage_events: Killer[];
  stats: Location;
  economy: StatEconomy;
  was_afk: boolean;
  received_penalty: boolean;
  stayed_in_spawn: boolean;
}

export interface StatEconomy {
  weapon: Weapon;
  armor: Map;
}

export interface Team {
  team_id: string;
  rounds: { won: number, lost: number };
  won: boolean;
  premier_roster: PremierRoster;
}

export interface PremierRoster {
  id: string;
  name: string;
  tag: string;
  members: string[];
  customization: Customization;
}

export interface Customization {
  icon: string;
  image: string;
  primary_color: string;
  secondary_color: string;
  tertiary_color: string;
}
export interface GetMMRResponse {
  account: Account;
  peak: Peak;
  current: Current;
  seasonal: Seasonal[];
}

export interface Account {
  name: string;
  tag: string;
  puuid: string;
}

export interface Current {
  tier: Tier;
  rr: number;
  last_change: number;
  elo: number;
  games_needed_for_rating: number;
  leaderboard_placement: number | null;
}

export interface Tier {
  id: number;
  name: string;
}

export interface Peak {
  season: Season;
  ranking_schema: string;
  tier: Tier;
}

export interface Season {
  id: string;
  short: string;
}

export interface Seasonal {
  season: Season;
  wins: number;
  games: number;
  end_tier: Tier;
  ranking_schema: string;
  leaderboard_placement: LeaderboardPlacement | null;
  act_wins: Tier[];
}

export interface LeaderboardPlacement {
  rank: number;
  updated_at: string;
}
