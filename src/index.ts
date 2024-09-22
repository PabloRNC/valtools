import express from 'express';
import { connect } from 'mongoose';
import { Redis } from 'ioredis';
import { JWTPayload } from './lib';
import { Api } from './routes';
import { isAuthorized } from './middlewares';
import 'dotenv/config';

const app = express();
const redis = new Redis();

const PORT = Number(process.env.PORT) || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/api', isAuthorized, Api);

app.get('/', (req, res) => {
    res.send('Hello World!');
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
            PORT: string
            BASE_URL: string
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

export { redis };