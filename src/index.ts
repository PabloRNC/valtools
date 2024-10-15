import express from "express";
import { connect } from "mongoose";
import Redis from "ioredis";
import { Server, WebSocket } from "ws";
import statusMonitor from 'express-status-monitor';
import {
  AuthJWTPayload,
  JWTPayload,
} from "./lib";
import { Api, Auth } from "./routes";
import "dotenv/config";


let createServer =
  process.env.PROTOCOL === "http"
    ? require("http").createServer
    : require("https").createServer;

const connections = new Map<
  string,
  { socket: WebSocket; payload: JWTPayload }
>();

const server = createServer();
const ws = new Server({ server, path: "/ws/rso" });
const app = express();
const redis = new Redis();

const PORT = Number(process.env.PORT) || 8080;

app.use(statusMonitor());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.disable("x-powered-by");
app.use("/api", Api);
app.use("/auth", Auth);

app.get("/", (_req, res) => {
  res.sendFile("views/index.html", { root: "public" });
});

app.get("/tos", (_req, res) => {
  res.sendFile("views/tos.html", { root: "public" });
});

app.get("/privacy", (_req, res) => {
  res.sendFile("views/privacy.html", { root: "public" });
});

ws.on("connection", (socket) => {
  
});

server.on("listening", async () => {
  console.log(`Server is running on ${PORT}`);
  await connect(process.env.DATABASE_URI, { dbName: "main" });
  console.log("Connected to database");
});

server.on("request", app);

server.listen(PORT);

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URI: string;
      API_KEY: string;
      RIOT_API_KEY: string;
      PORT: string;
      BASE_URL: string;
      RIOT_BASE_URL: string;
      JWT_SECRET: string;
      AUTH_JWT_SECRET: string;
      PROTOCOL: "http" | "https";
      RSO_CLIENT_ID: string;
      RSO_CLIENT_SECRET: string;
      RSO_BASE_URL: string;
      RSO_REDIRECT_URI: string;
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

export { redis, connections };
