import { model, Schema } from "mongoose";

export interface IAuth {
    puuid: string;
    access_token: string;
    refresh_token: string;
}

export const AuthSchema = new Schema<IAuth>({
    puuid: { type: String, required: true, unique: true },
    access_token: { type: String, required: true },
    refresh_token: { type: String, required: true }
});

export const Auth = model<IAuth>('Auth', AuthSchema);