export type APIBody = PostMMRHistoryRawBody;

export interface PostMMRHistoryRawBody {
    value: string
    type: string
    region: string
    platform: 'pc' | 'console'
}