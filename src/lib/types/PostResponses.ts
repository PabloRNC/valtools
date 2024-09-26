export type PostResponses = PostMMRHistoryRawResponse;

export interface PostMMRHistoryRawResponse {
  Version: number;
  Subject: string;
  Matches: Match[];
}

export interface Match {
  MatchID: string;
  MapID: string;
  SeasonID: string;
  MatchStartTime: number;
  TierAfterUpdate: number;
  TierBeforeUpdate: number;
  RankedRatingAfterUpdate: number;
  RankedRatingBeforeUpdate: number;
  RankedRatingEarned: number;
  RankedRatingPerformanceBonus: number;
  CompetitiveMovement: string;
  AFKPenalty: number;
}
