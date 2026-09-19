import { Router } from 'express';
import { aleshaChat, aleshaStatus } from '../controllers/aleshaController';

// Public on purpose: the assistant is also available on the public portal (no login).
// TODO(realtime): add an SSE/WebSocket endpoint here for streaming replies / live voice.
const router = Router();
router.get('/status', aleshaStatus);
router.post('/chat', aleshaChat);

export default router;
