import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Outbound mail. No SMTP is configured in this environment, so delivery is SIMULATED:
 * every message is logged and appended to <backend>/outbox/mail.log so it can be inspected.
 * Swap `deliver()` for nodemailer/SES when SMTP settings are available.
 */
export const MAIL_SIMULATE = process.env.MAIL_SIMULATE !== 'false';
export const ADMIN_CONTACT_EMAIL = process.env.ADMIN_CONTACT_EMAIL || 'admin@e-learning.local';
export const ADMIN_CONTACT_PHONE = process.env.ADMIN_CONTACT_PHONE || '';
const OUTBOX = path.resolve(process.cwd(), 'outbox');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export const sendMail = async (msg: MailMessage): Promise<{ delivery: 'simulated' | 'smtp' }> => {
  if (!MAIL_SIMULATE) {
    // Production hook: integrate an SMTP provider here.
    throw new Error('SMTP delivery is not configured (set MAIL_SIMULATE=true for local development)');
  }
  const stamp = new Date().toISOString();
  const entry = `--- ${stamp}\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n\n`;
  await mkdir(OUTBOX, { recursive: true });
  await appendFile(path.join(OUTBOX, 'mail.log'), entry, 'utf8');
  console.log(`[mail:simulated] -> ${msg.to} | ${msg.subject}`);
  return { delivery: 'simulated' };
};
