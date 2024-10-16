import { WebSocket } from "ws";
import { randomBytes } from "crypto";
import { verify, sign } from "jsonwebtoken";
import { connections } from ".";
import { JWTPayload, SessionAuth, WebSocketMessage } from "./lib";

export function WebSocketManager(socket: WebSocket){
    const identity = randomBytes(16).toString("hex");

  socket.on("close", () => {
    connections.delete(identity);
  });

  setTimeout(() => {
    if (!connections.has(identity)) {
      socket.send(JSON.stringify({ status: 401, error: "Unauthorized" }));
      socket.close();
    }
  }, 5000);
  socket.on("message", async (data) => {
    if (data instanceof Buffer) {
      try {
        const message = JSON.parse(
          Buffer.from(data).toString("utf-8")
        ) as WebSocketMessage;

        switch (message.metadata.type) {
          case "session_auth":
            {
                // @ts-ignore
              verify(
                // @ts-ignore
                message.payload.authorization,
                Buffer.from(process.env.JWT_SECRET, "base64"),
                { algorithms: ["HS256"] },
                (err, user: JWTPayload) => {
                  // @ts-ignore
                  if (message.payload.authorization !== "mock_auth") {
                    if (err) {
                      socket.send(
                        JSON.stringify({ status: 401, error: "Unauthorized" })
                      );
                      return socket.close();
                    }

                    const payload = (message as SessionAuth).payload;

                    if (user.channel_id !== payload.channelId) {
                      socket.send(
                        JSON.stringify({ status: 401, error: "Unauthorized" })
                      );
                      return socket.close();
                    }

                    if (connections.has(identity)) {
                      connections.get(identity)!.socket.close();
                      connections.delete(identity);
                    }

                    connections.set(identity, { socket, payload: user });
                    return socket.send(
                      JSON.stringify({
                        metadata: { type: "session_welcome" },
                        payload: { channel_id: user.channel_id },
                      })
                    );
                  }

                  // @ts-ignore
                  connections.set(identity, { socket, payload: { channel_id: "mock" } });
                
                  socket.send(
                    JSON.stringify({
                      metadata: { type: "session_welcome" },
                      // @ts-ignore
                      payload: { channel_id: message.payload.authorization },
                    })
                  );
                }
              );
            }

            break;

          case "ready_for_auth": {
            if (!connections.has(identity)) {
              socket.send(
                JSON.stringify({ status: 401, error: "Unauthorized" })
              );
              return socket.close();
            }

            const state = sign(
              {
                channel_id: connections.get(identity)!.payload.channel_id,
                identity,
              },
              Buffer.from(process.env.AUTH_JWT_SECRET, "base64"),
              { algorithm: "HS256", expiresIn: "5min" }
            );

            socket.send(
              JSON.stringify({
                metadata: { type: "auth_ready" },
                payload: { url: connections.get(identity)!.payload.channel_id === 'mock' ? `https://auth.riotgames.com/authorize?client_id=${process.env.RSO_CLIENT_ID}&redirect_uri=${process.env.RSO_REDIRECT_MOCK_URI}&response_type=code&scope=openid&state=${state}` :`https://auth.riotgames.com/authorize?client_id=${process.env.RSO_CLIENT_ID}&redirect_uri=${process.env.RSO_REDIRECT_URI}&response_type=code&scope=openid&state=${state}` },
              })
            );

            setTimeout(() => {
              if (connections.has(identity)) {
                const socket = connections.get(identity)!.socket;
                socket.send(
                  JSON.stringify({
                    status: 401,
                    error: "Authorization transition expired",
                  })
                );
                connections.delete(identity);
                return socket.close();
              }
            }, 1000 * 60 * 5);
          }
        }
      } catch (e) {
        socket.send(
          JSON.stringify({
            status: 400,
            error: `Bad Request. Malformed message. ${e}`,
          })
        );
        connections.delete(identity);
        return socket.close();
      }
    }
  });
}