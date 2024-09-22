import { Router } from 'express';
import { Setup } from './Setup';
import { Player } from './Player';

const router = Router();

router.use('/setup', Setup);
router.use('/players', Player);

export { router as Api };