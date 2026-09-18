import { randomInt, randomUUID } from 'node:crypto';

/**
 * Lightweight arithmetic captcha, verified server-side.
 * Operands are single digits (1-9) so the rendered question is always short and the
 * login/register layout never reflows ("Berapakah 4 + 7?").
 * Challenges live in memory for a few minutes and are single-use.
 * Set CAPTCHA_DISABLED=true to bypass (automated tests / local API clients).
 */
const TTL_MS = 5 * 60 * 1000;
const challenges = new Map<string, { answer: number; expires: number }>();

export const captchaEnabled = () => process.env.CAPTCHA_DISABLED !== 'true';

export interface CaptchaChallenge {
  id: string;
  /** e.g. "4 + 7" — the UI wraps it as "Berapakah 4 + 7?" */
  question: string;
  expires_in: number; // seconds
}

const sweep = () => {
  const now = Date.now();
  for (const [id, c] of challenges) if (c.expires <= now) challenges.delete(id);
};

export const issueCaptcha = (): CaptchaChallenge => {
  sweep();
  const a = randomInt(1, 10); // 1..9
  const b = randomInt(1, 10); // 1..9
  // Addition, or subtraction arranged so the result is never negative.
  const subtract = randomInt(0, 2) === 1;
  const [x, y] = a >= b ? [a, b] : [b, a];
  const question = subtract ? `${x} − ${y}` : `${a} + ${b}`;
  const answer = subtract ? x - y : a + b;
  const id = randomUUID();
  challenges.set(id, { answer, expires: Date.now() + TTL_MS });
  return { id, question, expires_in: TTL_MS / 1000 };
};

export type CaptchaResult = 'ok' | 'missing' | 'expired' | 'wrong';

/** Consumes the challenge (single-use) and checks the answer. */
export const verifyCaptcha = (id: unknown, answer: unknown): CaptchaResult => {
  if (!captchaEnabled()) return 'ok';
  if (typeof id !== 'string' || answer === undefined || answer === null || answer === '') return 'missing';
  const c = challenges.get(id);
  challenges.delete(id);
  if (!c || c.expires <= Date.now()) return 'expired';
  return Number(answer) === c.answer ? 'ok' : 'wrong';
};
