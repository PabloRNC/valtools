import type { Context } from "elysia";
import { verify } from "jsonwebtoken";
import type { JWTPayload } from "../lib";

export function isAuthorized(headers: Context["headers"]){    

    const data = headers["authorization"];

    if(!data){
        return false;
    }

    const [prefix, token] = data.split(" ");

    if(prefix !== "Bearer"){
        return false;
    }

    let payload: JWTPayload;

    try {
        payload = verify(token, Buffer.from(process.env.JWT_SECRET, "base64"), { algorithms: ["HS256"] }) as JWTPayload;
    } catch (error) {
        return false;
    }

    return payload;

}