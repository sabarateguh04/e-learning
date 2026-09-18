import { randomUUID } from 'node:crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';

export type NotificationType = 'REPORT_SUBMITTED' | 'REPORT_DECIDED';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  report_id: string | null;
  read_at: string | null;
  created_at: string;
}

interface NotificationRow extends RowDataPacket {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  report_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

const toNotification = (r: NotificationRow): Notification => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  link: r.link,
  report_id: r.report_id,
  read_at: r.read_at ? new Date(r.read_at).toISOString() : null,
  created_at: new Date(r.created_at).toISOString(),
});

export const notificationRepo = {
  /** Fan-out one message to many recipients in a single INSERT. */
  async createMany(input: { tenant_id: string; recipient_ids: string[]; type: NotificationType; title: string; body: string; link?: string | null; report_id?: string | null }): Promise<number> {
    if (!input.recipient_ids.length) return 0;
    const rows = input.recipient_ids.map((uid) => [randomUUID(), input.tenant_id, uid, input.type, input.title, input.body, input.link ?? null, input.report_id ?? null]);
    const [res] = await getPool().query<ResultSetHeader>(
      `INSERT INTO tbl_elearning_notifications (id, tenant_id, user_id, type, title, body, link, report_id) VALUES ?`,
      [rows],
    );
    return res.affectedRows;
  },

  async listForUser(userId: string, limit = 30): Promise<{ items: Notification[]; unread: number }> {
    const pool = getPool();
    const [rows] = await pool.query<NotificationRow[]>(
      `SELECT id, type, title, body, link, report_id, read_at, created_at
         FROM tbl_elearning_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit],
    );
    const [[cnt]] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS unread FROM tbl_elearning_notifications WHERE user_id = ? AND read_at IS NULL`, [userId]);
    return { items: rows.map(toNotification), unread: Number(cnt.unread) };
  },

  async unreadCount(userId: string): Promise<number> {
    const [[cnt]] = await getPool().query<RowDataPacket[]>(`SELECT COUNT(*) AS unread FROM tbl_elearning_notifications WHERE user_id = ? AND read_at IS NULL`, [userId]);
    return Number(cnt.unread);
  },

  async markRead(userId: string, id: string): Promise<boolean> {
    const [res] = await getPool().query<ResultSetHeader>(`UPDATE tbl_elearning_notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL`, [id, userId]);
    return res.affectedRows > 0;
  },

  async markAllRead(userId: string): Promise<number> {
    const [res] = await getPool().query<ResultSetHeader>(`UPDATE tbl_elearning_notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL`, [userId]);
    return res.affectedRows;
  },
};
