import { verify } from "jsonwebtoken";
import type { JWTPayload } from "./types";
import { User } from "../models";

export class AuthorizedUser{
    public payload: JWTPayload | null;
    constructor(){
        this.payload = null;
    }

    public verify(token: string){
        this.payload = verify(token, Buffer.from(process.env.JWT_SECRET, "base64"), { algorithms: ["HS256"] }) as JWTPayload;
    }

    public async getConfig(){
        if(!this.payload) return null;
        return await User.findOne({ channelId: this.channelId });
    }

    public get channelId(){
        return this.payload?.channel_id;
    }
}