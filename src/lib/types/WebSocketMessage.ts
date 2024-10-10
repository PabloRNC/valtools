export interface SessionAuth {
    metadata: MetaData<'session_auth'>
    payload: SessionAuthPayload
}

export interface SessionAuthPayload {
    authorization: string;
    channelId: string;
}

export interface ReadyForAuth {
    metadata: MetaData<'ready_for_auth'>
}

export interface MetaData<T extends string> {
    type: T
}

export type WebSocketMessage = SessionAuth | ReadyForAuth;