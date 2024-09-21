import { Router } from 'express';
import { Setup } from './Setup';

const router = Router();

router.use('/setup', Setup);

export { router as Api };