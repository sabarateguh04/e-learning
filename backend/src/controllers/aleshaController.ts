import { Request, Response } from 'express';
import { ALESHA, chat, ChatTurn } from '../services/aleshaEngine';

/** GET /api/alesha/status — lets the UI show which engine is answering. */
export function aleshaStatus(_req: Request, res: Response) {
  res.json({ success: true, data: { ...ALESHA, ready: true } });
}

/** POST /api/alesha/chat — { message, history?, context? } → { reply, suggestions, engine } */
export async function aleshaChat(req: Request, res: Response) {
  const message = String(req.body?.message ?? '').trim().slice(0, 2000);
  const history = (Array.isArray(req.body?.history) ? req.body.history : [])
    .filter((t: ChatTurn) => (t?.role === 'user' || t?.role === 'assistant') && typeof t.content === 'string')
    .slice(-20) as ChatTurn[];
  const context = typeof req.body?.context === 'object' && req.body.context ? req.body.context : {};
  try {
    const data = await chat(message, history, context);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[alesha]', err);
    res.status(500).json({ success: false, message: 'Alesha sedang tidak dapat menjawab. Coba lagi sebentar.' });
  }
}
