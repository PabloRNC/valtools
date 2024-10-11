import { model, Schema } from "mongoose";

export interface IUser {
  channelId: string;
  puuid: string;
  region: string;
  username: string;
  tag: string;
  config: { match_history: boolean; platform: "pc" | "console" };
}

export const UserSchema = new Schema<IUser>({
  channelId: { type: String, required: true },
  puuid: { type: String, required: true },
  region: { type: String, required: true },
  username: { type: String, required: true },
  tag: { type: String, required: true },
  config: {
    type: {
      match_history: { type: Boolean, required: true },
      platform: { type: String, required: true, enum: ["pc", "console"] },
    },
    required: false,
    default: { match_history: true, platform: "pc" }
  },
});

export const User = model<IUser>("User", UserSchema);
