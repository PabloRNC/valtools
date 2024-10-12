import { randomBytes } from 'crypto';
import express from 'express';
import { connect } from 'mongoose';
import Redis from 'ioredis';
import { Server, WebSocket } from 'ws';
import { sign, verify } from 'jsonwebtoken';
import { AuthJWTPayload, JWTPayload, SessionAuth, WebSocketMessage } from './lib';
import { Api, Auth } from './routes';
import 'dotenv/config';



let createServer = process.env.PROTOCOL === 'http' ? require('http').createServer : require('https').createServer;

const connections = new Map<string, { socket: WebSocket, payload: JWTPayload }>();

const server = createServer();
const ws = new Server({ server, path: '/ws/rso' });
const app = express();
const redis = new Redis();

const PORT = Number(process.env.PORT) || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.disable('x-powered-by');
app.use('/api', Api);
app.use('/auth', Auth);

app.get('/', (_req, res) => {
    res.sendFile('views/index.html', { root: 'public' });
});

app.get('/tos', (_req, res) => {
    res.sendFile('views/tos.html', { root: 'public' });
});

app.get('/privacy', (_req, res) => {
    res.sendFile('views/privacy.html', { root: 'public' });
});

ws.on('connection', (socket) => {

    const identity = randomBytes(16).toString('hex');

    socket.on('close', () => {
        connections.delete(identity)
    });

    setTimeout(() => {
        if(!connections.has(identity)){
            socket.send(JSON.stringify({ status: 401, error: 'Unauthorized' }));
            socket.close();
        }
    }, 5000)
    socket.on('message', async(data) => {
        if(data instanceof Buffer){
            try {

                const message = JSON.parse(Buffer.from(data).toString('utf-8')) as WebSocketMessage;

                switch(message.metadata.type){
                    case 'session_auth': {
                        // @ts-ignore
                        verify(message.payload.authorization, Buffer.from(process.env.JWT_SECRET, 'base64'), { algorithms: ['HS256'] }, (err, user: JWTPayload) => {
                            if(err){
                                socket.send(JSON.stringify({ status: 401, error: 'Unauthorized' }));
                                return socket.close();
                            }

                            const payload = (message as SessionAuth).payload

                            if(user.channel_id !== payload.channelId){
                                socket.send(JSON.stringify({ status: 401, error: 'Unauthorized' }));
                                return socket.close();
                            }

                            if(connections.has(identity)){
                                connections.get(identity)!.socket.close();
                                connections.delete(identity)
                            }

                            connections.set(identity, { socket, payload: user });
                            socket.send(JSON.stringify({ metadata: { type: 'session_welcome' }, payload: { channel_id: user.channel_id } }));
                        })
                    }

                    break;

                    case 'ready_for_auth': {
                        if(!connections.has(identity)){
                            socket.send(JSON.stringify({ status: 401, error: 'Unauthorized' }));
                            return socket.close();
                        }

                        const state = sign({ channel_id: connections.get(identity)!.payload.channel_id, identity }, Buffer.from(process.env.AUTH_JWT_SECRET, 'base64'), { algorithm: 'HS256', expiresIn: '5min' });

                        socket.send(JSON.stringify({ metadata: { type: 'auth_ready' }, payload: { state } }));

                        setTimeout(() => {
                            if(connections.has(identity)){
                                const socket = connections.get(identity)!.socket;
                                socket.send(JSON.stringify({ status: 401, error: 'Authorization transition expired' }));
                                connections.delete(identity);
                                return socket.close();
                            }
                        }, 1000 * 60 * 5);
                    }
                }


            } catch(e){
                socket.send(JSON.stringify({ status: 400, error: 'Bad Request. Malformed message.' }));
                connections.delete(identity);
                return socket.close();
            }

        }
    });
})

server.on('listening', async() => {
    console.log(`Server is running on ${PORT}`);
    await connect(process.env.DATABASE_URI, { dbName: 'main' });
    console.log('Connected to database');
})

server.on('request', app);

server.listen(PORT)

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            DATABASE_URI: string
            API_KEY: string
            RIOT_API_KEY: string
            PORT: string
            BASE_URL: string
            RIOT_BASE_URL: string
            JWT_SECRET: string
            AUTH_JWT_SECRET: string
            PROTOCOL: 'http' | 'https'
            RSO_CLIENT_ID: string
            RSO_CLIENT_SECRET: string
            RSO_BASE_URL: string
            RSO_REDIRECT_URI: string
        }
    }

    namespace Express {
        interface Request {
            payload: JWTPayload
        }
    }
}

declare module 'jsonwebtoken' {
    export function verify(token: string, secret: string | Buffer, options?: VerifyOptions): JWTPayload | AuthJWTPayload;
}

export { redis, connections };