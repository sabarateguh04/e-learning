import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';
import { UserPayload } from '../middlewares/authenticate';
import { AnalyticsFilters, EMPTY_FILTERS, reportScopeSql, trendWindow } from '../services/scope';

/** Target audience of a field activity (education level). Mirrored into audience_category for analytics grouping. */
export const AUDIENCE_CATEGORIES = ['TK/SD', 'SMP', 'SMA/SMK', 'Mahasiswa', 'Umum'] as const;
export type AudienceCategory = (typeof AUDIENCE_CATEGORIES)[number];
export type ReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ReportRow extends RowDataPacket {
  id: string;
  tenant_id: string;
  trainer_id: string;
  trainer_name: string;
  module_id: string;
  module_title: string;
  provinsi_id: number | null;
  kota_id: number | null;
  provinsi_name: string | null;
  kota_name: string | null;
  location_name: string;
  report_date: Date | string | null;
  audience_category: AudienceCategory;
  audience: AudienceCategory | null;
  participant_count: number;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  photo_url: string | null;
  photo_urls: string[] | string | null;
  status: ReportStatus;
  approver_role_level: number | null;
  reviewed_by: string | null;
  reviewed_by_role: number | null;
  reviewer_name: string | null;
  review_path: 'DIRECT_SUPERVISOR' | 'SUPER_ADMIN_OVERRIDE' | null;
  review_note: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

/** API shape (explicit — RowDataPacket's index signature would swallow named keys under Omit). */
export interface FieldReport {
  id: string;
  tenant_id: string;
  trainer_id: string;
  trainer_name: string;
  module_id: string;
  module_title: string;
  provinsi_id: number | null;
  kota_id: number | null;
  provinsi_name: string | null;
  kota_name: string | null;
  territory_name: string;
  location_name: string;
  /** Activity date (YYYY-MM-DD) chosen by the trainer */
  report_date: string;
  audience_category: AudienceCategory;
  audience: AudienceCategory;
  participant_count: number;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  photo_url: string | null;
  /** 2-4 evidence photos */
  photo_urls: string[];
  status: ReportStatus;
  approver_role_level: number | null;
  reviewed_by: string | null;
  reviewed_by_role: number | null;
  reviewer_name: string | null;
  review_path: 'DIRECT_SUPERVISOR' | 'SUPER_ADMIN_OVERRIDE' | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface InsertReportInput {
  id: string;
  tenant_id: string;
  trainer_id: string;
  module_id: string;
  provinsi_id: number | null;
  kota_id: number | null;
  location_name: string;
  report_date: string;
  audience: AudienceCategory;
  participant_count: number;
  latitude: number;
  longitude: number;
  notes: string | null;
  photo_urls: string[];
  approver_role_level: number;
}

export interface ReportFilters {
  status?: string | null;
  module_id?: string | null;
  q?: string;
}

const SELECT = `
  SELECT r.*, u.full_name AS trainer_name, m.title AS module_title, p.nama AS provinsi_name, k.nama AS kota_name, rv.full_name AS reviewer_name
    FROM tbl_elearning_field_reports r
    JOIN tbl_elearning_users u ON u.id = r.trainer_id
    JOIN tbl_elearning_modules m ON m.id = r.module_id
    LEFT JOIN tbl_elearning_users rv ON rv.id = r.reviewed_by
    LEFT JOIN tbl_elearning_provinsi p ON p.id = r.provinsi_id
    LEFT JOIN tbl_elearning_kota k ON k.id = r.kota_id`;

const toDateOnly = (v: Date | string | null): string | null => {
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getTime() - v.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

/** mysql2 returns JSON columns parsed; be defensive for TEXT-typed fallbacks and legacy single photo_url. */
const parsePhotos = (v: string[] | string | null, legacy: string | null): string[] => {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      /* fall through */
    }
  }
  return legacy ? [legacy] : [];
};

const toReport = (r: ReportRow): FieldReport => ({
  id: r.id,
  tenant_id: r.tenant_id,
  trainer_id: r.trainer_id,
  trainer_name: r.trainer_name,
  module_id: r.module_id,
  module_title: r.module_title,
  provinsi_id: r.provinsi_id,
  kota_id: r.kota_id,
  provinsi_name: r.provinsi_name,
  kota_name: r.kota_name,
  territory_name: r.kota_name ?? r.provinsi_name ?? 'Nasional',
  location_name: r.location_name,
  report_date: toDateOnly(r.report_date) ?? new Date(r.created_at).toISOString().slice(0, 10),
  audience_category: r.audience_category,
  audience: r.audience ?? r.audience_category,
  participant_count: Number(r.participant_count),
  latitude: r.latitude === null ? null : Number(r.latitude),
  longitude: r.longitude === null ? null : Number(r.longitude),
  notes: r.notes,
  photo_url: r.photo_url,
  photo_urls: parsePhotos(r.photo_urls, r.photo_url),
  status: r.status,
  approver_role_level: r.approver_role_level ?? null,
  reviewed_by: r.reviewed_by ?? null,
  reviewed_by_role: r.reviewed_by_role ?? null,
  reviewer_name: r.reviewer_name ?? null,
  review_path: r.review_path ?? null,
  review_note: r.review_note ?? null,
  reviewed_at: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
  created_at: new Date(r.created_at).toISOString(),
});

export const reportRepo = {
  async insert(input: InsertReportInput): Promise<FieldReport> {
    await getPool().query(
      `INSERT INTO tbl_elearning_field_reports
         (id, tenant_id, trainer_id, module_id, provinsi_id, kota_id, location_name, report_date, audience_category, audience, participant_count, latitude, longitude, notes, photo_url, photo_urls, approver_role_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id, input.tenant_id, input.trainer_id, input.module_id, input.provinsi_id, input.kota_id, input.location_name, input.report_date,
        input.audience, input.audience, input.participant_count, input.latitude, input.longitude, input.notes, input.photo_urls[0] ?? null,
        JSON.stringify(input.photo_urls), input.approver_role_level,
      ],
    );
    const [rows] = await getPool().query<ReportRow[]>(`${SELECT} WHERE r.id = ?`, [input.id]);
    return toReport(rows[0]);
  },

  async findById(id: string): Promise<FieldReport | null> {
    const [rows] = await getPool().query<ReportRow[]>(`${SELECT} WHERE r.id = ? LIMIT 1`, [id]);
    return rows[0] ? toReport(rows[0]) : null;
  },

  /** Records the hierarchical decision. Only a PENDING report can be reviewed (guarded by the WHERE). */
  async review(id: string, decision: { status: 'APPROVED' | 'REJECTED'; reviewer_id: string; reviewer_role: number; path: 'DIRECT_SUPERVISOR' | 'SUPER_ADMIN_OVERRIDE'; note: string | null }): Promise<boolean> {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE tbl_elearning_field_reports
          SET status = ?, reviewed_by = ?, reviewed_by_role = ?, review_path = ?, review_note = ?, reviewed_at = NOW()
        WHERE id = ? AND status = 'PENDING'`,
      [decision.status, decision.reviewer_id, decision.reviewer_role, decision.path, decision.note, id],
    );
    return result.affectedRows > 0;
  },

  /** Scoped list (see services/scope.ts) with optional filters. */
  async listScoped(user: UserPayload, filters: ReportFilters = {}): Promise<FieldReport[]> {
    const scope = reportScopeSql(user, 'r');
    const where = [scope.sql];
    const params = [...scope.params];

    if (filters.status) { where.push('r.status = ?'); params.push(filters.status); }
    if (filters.module_id) { where.push('r.module_id = ?'); params.push(filters.module_id); }
    if (filters.q) {
      where.push('(r.location_name LIKE ? OR u.full_name LIKE ? OR m.title LIKE ? OR k.nama LIKE ? OR p.nama LIKE ?)');
      const like = `%${filters.q}%`;
      params.push(like, like, like, like, like);
    }

    const [rows] = await getPool().query<ReportRow[]>(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT 500`, params);
    return rows.map(toReport);
  },

  /** Aggregations for the executive dashboard, all under the same scope. */
  async analytics(user: UserPayload, topN = 5, filters: AnalyticsFilters = EMPTY_FILTERS) {
    const pool = getPool();
    const scope = reportScopeSql(user, 'r', filters);
    const window = trendWindow(filters);

    const [[summary]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_sessions,
              COALESCE(SUM(r.participant_count), 0) AS total_participants,
              COALESCE(ROUND(AVG(r.participant_count), 1), 0) AS avg_participants,
              SUM(r.status = 'PENDING') AS pending_reviews,
              SUM(r.status = 'APPROVED') AS approved,
              COUNT(DISTINCT r.trainer_id) AS active_trainers,
              COUNT(DISTINCT r.module_id) AS modules_used
         FROM tbl_elearning_field_reports r
        WHERE ${scope.sql}`,
      scope.params,
    );

    const [trainers] = await pool.query<RowDataPacket[]>(
      `SELECT r.trainer_id, u.full_name AS trainer_name, COALESCE(k.nama, p.nama, 'National') AS territory_name,
              COUNT(*) AS report_count, SUM(r.participant_count) AS participants, SUM(r.status = 'APPROVED') AS approved_count
         FROM tbl_elearning_field_reports r
         JOIN tbl_elearning_users u ON u.id = r.trainer_id
         LEFT JOIN tbl_elearning_kota k ON k.id = u.kota_id
         LEFT JOIN tbl_elearning_provinsi p ON p.id = u.provinsi_id
        WHERE ${scope.sql}
        GROUP BY r.trainer_id, u.full_name, territory_name
        ORDER BY report_count DESC, participants DESC
        LIMIT ?`,
      [...scope.params, topN],
    );

    const [modules] = await pool.query<RowDataPacket[]>(
      `SELECT r.module_id, m.title, COALESCE(m.category, 'General') AS category,
              m.view_count, m.public_view_count, m.presentation_count,
              COUNT(*) AS usage_count, SUM(r.participant_count) AS participants
         FROM tbl_elearning_field_reports r
         JOIN tbl_elearning_modules m ON m.id = r.module_id
        WHERE ${scope.sql}
        GROUP BY r.module_id, m.title, m.category, m.view_count, m.public_view_count, m.presentation_count
        ORDER BY usage_count DESC, participants DESC
        LIMIT ?`,
      [...scope.params, topN],
    );

    const [daily] = await pool.query<RowDataPacket[]>(
      `SELECT DATE(r.created_at) AS d, COUNT(*) AS sessions, SUM(r.participant_count) AS participants
         FROM tbl_elearning_field_reports r
        WHERE ${scope.sql} AND DATE(r.created_at) BETWEEN ? AND ?
        GROUP BY DATE(r.created_at)`,
      [...scope.params, window.from, window.to],
    );

    return { summary, trainers, modules, daily, window };
  },
};
