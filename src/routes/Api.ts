import { Router } from 'express';
import { Setup } from './Setup';
import { Player } from './Player';
import { isAuthorized } from '../middlewares';

const router = Router();

router.use('/setup', isAuthorized, Setup);
router.use('/players', isAuthorized, Player);


export { router as Api };