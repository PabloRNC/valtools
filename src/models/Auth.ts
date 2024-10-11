import { model, Schema } from "mongoose";

export interface IAuth {
    access_token: string;
    refresh_token: string;
}

export const AuthSchema = new Schema<IAuth>({
    access_token: { type: String, required: true },
    refresh_token: { type: String, required: true }
});

export const User = model<IAuth>('Auth', AuthSchema);