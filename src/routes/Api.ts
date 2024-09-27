import { Router } from 'express';
import { Setup } from './Setup';
import { Player } from './Player';
import { Example } from './Example';
import { isAuthorized } from '../middlewares';

const router = Router();

router.use('/setup', isAuthorized, Setup);
router.use('/players', isAuthorized, Player);
router.use('/example', Example);

export { router as Api };