import type { Context } from "elysia";
import type { AuthorizedUser } from "../src/lib";

export function isAuthorized({ user, headers, set } : Context<{}, { decorator: { user: AuthorizedUser}, store: {}, derive: {}, resolve: {} }>){    

    const data = headers["authorization"];

    if(!data){
        set.status = 401;
        return { status: 401, error: "Unauthorized" };
    }

    const [prefix, token] = data.split(" ");

    if(prefix !== "Bearer"){
        set.status = 401;
        return { status: 401, error: "Unauthorized" };
    }

    try {
        user.verify(token);
    } catch (error) {
        set.status = 401;
        return { status: 401, error: "Unauthorized" };
    }

}