export interface PostSetupRequestBody {
    channelId: string;
    username: string;
    tag: string;
    match_history: boolean;
    platform: 'pc' | 'console';
}

export interface PutSetupRequestBody {
    channelId: string;
    username: string;
    tag: string;
    match_history: boolean;
    platform: 'pc' | 'console';
}