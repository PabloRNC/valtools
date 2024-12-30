export interface JWTPayload {
    channel_id: string;
    exp: number;
    is_unlinked: boolean;
    opaque_user_id: string;
    pubsub_perms: object;
    role: string;
    user_id: string;
}