import { sign, verify } from "jsonwebtoken";
import { Elysia, file, t } from "elysia";
import type { ElysiaWS } from "elysia/ws";
import { cors } from "@elysiajs/cors";
import { html } from "@elysiajs/html";
import { staticPlugin } from "@elysiajs/static";
import { Redis } from 'ioredis';
import { connect, connections as MongoDBConnections } from "mongoose";
import type { JWTPayload, AuthJWTPayload } from "./lib/types";
import { Api, Auth } from './routes'

export const connections = new Map<string, { ws: ElysiaWS, payload: JWTPayload }>();

export const redis = new Redis();

const app = new Elysia({
  websocket: { idleTimeout: 60 * 2 }
})
  .use(cors())
  .use(staticPlugin({ prefix: "/" }))
  .use(html())
  .use(Auth)
  .use(Api);

app.ws("/ws/rso", {
  body: t.Object({
    metadata: t.Object({
      type: t.String(),
    }),
    payload: t.Optional(t.Object({
      authorization: t.String(),
      channelId: t.String(),
    })),
  }),
  message: (ws, data) => {

    const payload = data.payload;

    switch (data.metadata.type) {
      case "session_auth": {

        if (connections.has(ws.id)) {
          ws.send({ error: "Already authenticating", status: 401 });
          ws.close(4000, "Already authenticating");
          return;
        }

        if(payload?.authorization === 'mock_auth' && payload?.channelId === 'mock'){
          // @ts-ignore
          connections.set(ws.id, { ws, payload: { channel_id: 'mock' } });
          ws.send({ metadata: { type: "session_welcome" }, payload: { channel_id: 'mock' } });
          return;
        }
        

        let authData: JWTPayload;

        try {
          authData = verify(
            payload?.authorization!,
            Buffer.from(process.env.JWT_SECRET, "base64")
          ) as JWTPayload;
        } catch (e) {
          ws.send({ error: "Unauthorized", status: 401 });
          ws.close(4000, "Unauthorized");
          return;
        }

        if(authData.channel_id !== payload?.channelId){
          ws.send({ error: "Unauthorized", status: 401 });
          ws.close(4000, "Unauthorized");
          return;
        }

        connections.set(ws.id, { ws, payload: authData });

        ws.send({
          metadata: { type: "session_welcome" },
          payload: { channel_id: authData.channel_id },
        });

      }

      break;

      case "ready_for_auth": {

        const connection = connections.get(ws.id);

        if(!connection){
            ws.send({error: "Not authenticated", status: 401});
            ws.close(4000, "Not authenticated");
            return;
        }

        if (
          connection?.payload.channel_id === 'mock'
        ) {
          const state = sign(
            { channel_id: "mock", identity: ws.id },
            Buffer.from(process.env.AUTH_JWT_SECRET, "base64"),
            { expiresIn: "5min", algorithm: "HS256" }
          );

          return ws.send({
            metadata: { type: "auth_ready" },
            payload: {
              url: `https://auth.riotgames.com/authorize?client_id=${process.env.RSO_CLIENT_ID}&redirect_uri=${process.env.RSO_REDIRECT_MOCK_URI}&response_type=code&scope=openid+offline_access&state=${state}`,
            },
          });
        }

        const state = sign(
          { channel_id: connection!.payload.channel_id, identity: ws.id },
          Buffer.from(process.env.AUTH_JWT_SECRET, "base64"),
          { expiresIn: "5min", algorithm: "HS256" }
        );

        connections.set(ws.id, { ws, payload: connection!.payload });

        ws.send({
          metadata: { type: "auth_ready" },
          payload: {
            url: `https://auth.riotgames.com/authorize?client_id=${process.env.RSO_CLIENT_ID}&redirect_uri=${process.env.RSO_REDIRECT_URI}&response_type=code&scope=openid+offline_access&state=${state}`,
          },
        });
      }
    }
  },
  close: (ws) => {
    connections.delete(ws.id);
  }
});

app.get("/", () => {
  return file("public/views/index.html")
});

app.get("/leaderboard", () => {
  return file("public/views/leaderboard.html");
});

app.get("/tos", () => {
  return file("public/views/tos.html");
});

app.get("/privacy", () => {
  return file("public/views/privacy.html");
});

app.get("/bugs", () => {
  return file("public/views/bugs.html");
})

app.listen(8080, async() => {
  console.log("Listening on port 8080");
  await connect(process.env.DATABASE_URI, { dbName: process.env.DB_NAME });
  console.log("Connected to database");
});

process.on("SIGINT", async () => {
  await redis.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await MongoDBConnections[0].close();
  process.exit(0);
});


declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URI: string;
      RIOT_API_KEY: string;
      PORT: string;
      RIOT_BASE_URL: string;
      JWT_SECRET: string;
      AUTH_JWT_SECRET: string;
      RSO_CLIENT_ID: string;
      RSO_CLIENT_SECRET: string;
      RSO_BASE_URL: string;
      RSO_REDIRECT_URI: string;
      RSO_REDIRECT_MOCK_URI: string;
      DB_NAME: string;
      HCAPTCHA_SECRET: string;
      BUG_PANEL_PASSWORD: string;
      BUG_PANEL_USERNAME: string;
    }
  }

  namespace Express {
    interface Request {
      payload: JWTPayload;
    }
  }
}

declare module "jsonwebtoken" {
  export function verify(
    token: string,
    secret: string | Buffer,
    options?: VerifyOptions
  ): JWTPayload | AuthJWTPayload;
}