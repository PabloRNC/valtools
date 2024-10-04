import express from 'express';
import { connect } from 'mongoose';
import { JWTPayload } from './lib';
import { Api } from './routes';
import 'dotenv/config';

const app = express();
//const redis = new Redis();

const PORT = Number(process.env.PORT) || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.disable('x-powered-by');
app.use('/api', Api);

app.get('/', (_req, res) => {
    res.sendFile('views/index.html', { root: 'public'});
});

app.get('/tos', (_req, res) => {
    res.sendFile('views/tos.html', { root: 'public'});
});

app.get('/privacy', (_req, res) => {
    res.sendFile('views/privacy.html', { root: 'public' });
});

app.listen(PORT, async() => {
    console.log(`Server is running on ${PORT}`);
    await connect(process.env.DATABASE_URI, { dbName: 'main' });
    console.log('Connected to database');
});


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
        }
    }

    namespace Express {
        interface Request {
            payload: JWTPayload
        }
    }
}

declare module 'jsonwebtoken' {
    export function verify(token: string, secret: string | Buffer, options?: VerifyOptions): JWTPayload;
}