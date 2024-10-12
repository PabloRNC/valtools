export interface PutSetupRequestBody {
    channelId: string;
    username: string;
    tag: string;
    match_history: boolean;
    platform: 'pc' | 'console';
    daily: {
        enabled: boolean;
        only_competitive: boolean;
    };
}