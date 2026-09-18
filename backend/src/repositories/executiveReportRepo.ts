import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';
import { UserPayload } from '../middlewares/authenticate';
import { ROLE } from '../middlewares/rbacGuard';
import { AnalyticsFilters, EMPTY_FILTERS, reportScopeSql, territorySql, trendWindow } from '../services/scope';

export type BreakdownLevel = 'provinsi' | 'kota' | 'trainer';

export interface ExecutiveReportData {
  window: { from: string; to: string; days: number };
  breakdown_level: BreakdownLevel;
  summary: RowDataPacket;
  views_summary: RowDataPacket;
  trainer_pool: RowDataPacket;
  top_modules: RowDataPacket[];
  top_trainers: RowDataPacket[];
  activities: RowDataPacket[];
  breakdown: RowDataPacket[];
  audience_mix: RowDataPacket[];
  daily: RowDataPacket[];
}

export const executiveReportRepo = {
  async build(user: UserPayload, opts: { topN?: number; activityLimit?: number; filters?: AnalyticsFilters } = {}): Promise<ExecutiveReportData> {
    const pool = getPool();
    const topN = opts.topN ?? 10;
    const activityLimit = opts.activityLimit ?? 60;
    const filters = opts.filters ?? EMPTY_FILTERS;
    const window = trendWindow(filters);
    const rs = reportScopeSql(user, 'r', filters);
    // Users: territory + satker (no dates — a trainer pool is not an event stream).
    const us = territorySql(user, 'u', filters);
    // Views: territory + satker via the viewer + the date range.
    const vs = territorySql(user, 'v', filters, { withDates: true, userIdColumn: 'user_id' });

    // ── Summary: field-report KPIs inside the scope ─────────────────────────
    const [[summary]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_sessions,
              COALESCE(SUM(r.participant_count), 0) AS total_participants,
              COALESCE(ROUND(AVG(r.participant_count), 1), 0) AS avg_participants,
              COALESCE(SUM(r.status = 'PENDING'), 0) AS pending_reviews,
              COALESCE(SUM(r.status = 'APPROVED'), 0) AS approved,
              COALESCE(SUM(r.status = 'REJECTED'), 0) AS rejected,
              COUNT(DISTINCT r.trainer_id) AS active_trainers,
              COUNT(DISTINCT r.module_id) AS modules_used,
              COUNT(DISTINCT r.kota_id) AS cities_covered
         FROM tbl_elearning_field_reports r
        WHERE ${rs.sql}`,
      rs.params,
    );

    // ── Module access inside the scope (view log carries the viewer's territory) ──
    const [[views_summary]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_views,
              COALESCE(SUM(v.kind = 'VIEW'), 0) AS internal_views,
              COALESCE(SUM(v.kind = 'PUBLIC'), 0) AS public_views,
              COALESCE(SUM(v.kind = 'PRESENTATION'), 0) AS presentations,
              COUNT(DISTINCT v.user_id) AS unique_viewers,
              COUNT(DISTINCT v.module_id) AS modules_accessed,
              COALESCE(SUM(v.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)), 0) AS views_7d
         FROM tbl_elearning_module_views v
        WHERE ${vs.sql}`,
      vs.params,
    );

    // ── Trainer pool & catalogue inside the scope ───────────────────────────
    const [[trainer_pool]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total_trainers,
              COALESCE(SUM(u.account_status = 'ACTIVE'), 0) AS active_accounts,
              COALESCE(SUM(u.account_status = 'PENDING'), 0) AS pending_accounts,
              (SELECT COUNT(*) FROM tbl_elearning_modules m WHERE m.approval_status = 'APPROVED') AS modules_available,
              (SELECT COUNT(*) FROM tbl_elearning_modules m JOIN tbl_elearning_users a ON a.id = m.author_id WHERE ${us.sql.replaceAll('u.', 'a.')}) AS modules_uploaded
         FROM tbl_elearning_users u
        WHERE ${us.sql} AND u.role_level = ${ROLE.TRAINER}`,
      [...us.params, ...us.params],
    );

    // ── Most accessed modules (viewer count) inside the scope ───────────────
    const [top_modules] = await pool.query<RowDataPacket[]>(
      `SELECT m.id AS module_id, m.title, m.target_audience, COALESCE(m.category, 'Umum') AS category,
              COUNT(v.id) AS views,
              COALESCE(SUM(v.kind = 'VIEW'), 0) AS internal_views,
              COALESCE(SUM(v.kind = 'PUBLIC'), 0) AS public_views,
              COALESCE(SUM(v.kind = 'PRESENTATION'), 0) AS presentations,
              COUNT(DISTINCT v.user_id) AS unique_viewers,
              MAX(v.created_at) AS last_viewed_at,
              (SELECT COUNT(*) FROM tbl_elearning_field_reports r WHERE r.module_id = m.id AND ${rs.sql}) AS sessions
         FROM tbl_elearning_modules m
         LEFT JOIN tbl_elearning_module_views v ON v.module_id = m.id AND ${vs.sql}
        WHERE m.approval_status = 'APPROVED'
        GROUP BY m.id, m.title, m.target_audience, m.category
        ORDER BY views DESC, sessions DESC, m.title
        LIMIT ?`,
      [...rs.params, ...vs.params, topN],
    );

    // ── Top trainers: field reports + module uploads + modules read ─────────
    const [top_trainers] = await pool.query<RowDataPacket[]>(
      `SELECT u.id AS trainer_id, u.full_name AS trainer_name, u.employee_id,
              COALESCE(li.nama, '-') AS instansi_name, COALESCE(lo.nama, '-') AS organisasi_name,
              COALESCE(k.nama, p.nama, 'Nasional') AS territory_name,
              COALESCE(rp.report_count, 0) AS report_count,
              COALESCE(rp.participants, 0) AS participants,
              COALESCE(rp.approved_count, 0) AS approved_count,
              COALESCE(up.modules_uploaded, 0) AS modules_uploaded,
              COALESCE(rd.modules_read, 0) AS modules_read,
              COALESCE(rp.report_count, 0) * 3 + COALESCE(up.modules_uploaded, 0) * 2 + COALESCE(rd.modules_read, 0) AS activity_score,
              GREATEST(COALESCE(rp.last_report_at, '1970-01-01'), COALESCE(rd.last_read_at, '1970-01-01'), COALESCE(up.last_upload_at, '1970-01-01')) AS last_activity_at
         FROM tbl_elearning_users u
         LEFT JOIN tbl_elearning_master_instansi   li ON li.id = u.legacy_instansi_id
         LEFT JOIN tbl_elearning_master_organisasi lo ON lo.id = u.legacy_org_id
         LEFT JOIN tbl_elearning_kota k ON k.id = u.kota_id
         LEFT JOIN tbl_elearning_provinsi p ON p.id = u.provinsi_id
         LEFT JOIN (SELECT r.trainer_id, COUNT(*) AS report_count, SUM(r.participant_count) AS participants,
                           SUM(r.status = 'APPROVED') AS approved_count, MAX(r.created_at) AS last_report_at
                      FROM tbl_elearning_field_reports r WHERE ${rs.sql} GROUP BY r.trainer_id) rp ON rp.trainer_id = u.id
         LEFT JOIN (SELECT m.author_id, COUNT(*) AS modules_uploaded, MAX(m.created_at) AS last_upload_at
                      FROM tbl_elearning_modules m GROUP BY m.author_id) up ON up.author_id = u.id
         LEFT JOIN (SELECT v.user_id, COUNT(DISTINCT v.module_id) AS modules_read, MAX(v.created_at) AS last_read_at
                      FROM tbl_elearning_module_views v WHERE v.kind = 'VIEW' GROUP BY v.user_id) rd ON rd.user_id = u.id
        WHERE ${us.sql} AND u.role_level = ${ROLE.TRAINER} AND u.account_status = 'ACTIVE'
        ORDER BY activity_score DESC, report_count DESC, u.full_name
        LIMIT ?`,
      [...rs.params, ...us.params, topN],
    );

    // ── Activity & progress table: latest field reports with module-read status ──
    const [activities] = await pool.query<RowDataPacket[]>(
      `SELECT r.id, r.created_at, r.status, r.location_name, r.audience_category, r.participant_count,
              u.full_name AS trainer_name, COALESCE(li.nama, '-') AS instansi_name, COALESCE(lo.nama, '-') AS organisasi_name,
              COALESCE(k.nama, p.nama, 'Nasional') AS territory_name,
              m.id AS module_id, m.title AS module_title,
              EXISTS (SELECT 1 FROM tbl_elearning_module_views v WHERE v.user_id = r.trainer_id AND v.module_id = r.module_id AND v.kind = 'VIEW') AS module_read
         FROM tbl_elearning_field_reports r
         JOIN tbl_elearning_users u ON u.id = r.trainer_id
         JOIN tbl_elearning_modules m ON m.id = r.module_id
         LEFT JOIN tbl_elearning_master_instansi   li ON li.id = u.legacy_instansi_id
         LEFT JOIN tbl_elearning_master_organisasi lo ON lo.id = u.legacy_org_id
         LEFT JOIN tbl_elearning_kota k ON k.id = r.kota_id
         LEFT JOIN tbl_elearning_provinsi p ON p.id = r.provinsi_id
        WHERE ${rs.sql}
        ORDER BY r.created_at DESC
        LIMIT ?`,
      [...rs.params, activityLimit],
    );

    // ── Comparative breakdown one level below the caller ────────────────────
    const breakdown_level: BreakdownLevel = user.role_level === ROLE.EXEC_CITY ? 'trainer' : user.role_level === ROLE.EXEC_PROVINCE ? 'kota' : 'provinsi';
    let breakdown: RowDataPacket[];
    if (breakdown_level === 'trainer') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT u.id, u.full_name AS name, COALESCE(li.nama, '-') AS hint,
                1 AS trainers,
                COALESCE(rp.sessions, 0) AS sessions, COALESCE(rp.participants, 0) AS participants, COALESCE(rp.approved, 0) AS approved,
                COALESCE(vw.views, 0) AS views, COALESCE(vw.modules_read, 0) AS modules_read
           FROM tbl_elearning_users u
           LEFT JOIN tbl_elearning_master_instansi li ON li.id = u.legacy_instansi_id
           LEFT JOIN (SELECT r.trainer_id, COUNT(*) AS sessions, SUM(r.participant_count) AS participants, SUM(r.status = 'APPROVED') AS approved
                        FROM tbl_elearning_field_reports r WHERE ${rs.sql} GROUP BY r.trainer_id) rp ON rp.trainer_id = u.id
           LEFT JOIN (SELECT v.user_id, COUNT(*) AS views, COUNT(DISTINCT v.module_id) AS modules_read
                        FROM tbl_elearning_module_views v WHERE v.kind = 'VIEW' GROUP BY v.user_id) vw ON vw.user_id = u.id
          WHERE ${us.sql} AND u.role_level = ${ROLE.TRAINER} AND u.account_status = 'ACTIVE'
          ORDER BY sessions DESC, views DESC, u.full_name`,
        [...rs.params, ...us.params],
      );
      breakdown = rows;
    } else {
      const col = breakdown_level === 'kota' ? 'kota_id' : 'provinsi_id';
      const table = breakdown_level === 'kota' ? 'tbl_elearning_kota' : 'tbl_elearning_provinsi';
      // Region rows = every region that has at least one user, report or view inside the scope.
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT g.id, g.nama AS name, '' AS hint,
                COALESCE(tr.trainers, 0) AS trainers,
                COALESCE(rp.sessions, 0) AS sessions, COALESCE(rp.participants, 0) AS participants, COALESCE(rp.approved, 0) AS approved,
                COALESCE(vw.views, 0) AS views, COALESCE(vw.modules_read, 0) AS modules_read
           FROM ${table} g
           LEFT JOIN (SELECT u.${col} AS rid, COUNT(*) AS trainers FROM tbl_elearning_users u
                       WHERE ${us.sql} AND u.role_level = ${ROLE.TRAINER} AND u.account_status = 'ACTIVE' GROUP BY u.${col}) tr ON tr.rid = g.id
           LEFT JOIN (SELECT r.${col} AS rid, COUNT(*) AS sessions, SUM(r.participant_count) AS participants, SUM(r.status = 'APPROVED') AS approved
                        FROM tbl_elearning_field_reports r WHERE ${rs.sql} GROUP BY r.${col}) rp ON rp.rid = g.id
           LEFT JOIN (SELECT v.${col} AS rid, COUNT(*) AS views, COUNT(DISTINCT v.module_id) AS modules_read
                        FROM tbl_elearning_module_views v WHERE ${vs.sql} GROUP BY v.${col}) vw ON vw.rid = g.id
          WHERE (tr.trainers IS NOT NULL OR rp.sessions IS NOT NULL OR vw.views IS NOT NULL)
            ${breakdown_level === 'kota' ? 'AND g.provinsi_id = ?' : ''}
          ORDER BY sessions DESC, views DESC, trainers DESC, g.nama`,
        [...us.params, ...rs.params, ...vs.params, ...(breakdown_level === 'kota' ? [user.provinsi_id ?? -1] : [])],
      );
      breakdown = rows;
    }

    // ── Audience mix ────────────────────────────────────────────────────────
    const [audience_mix] = await pool.query<RowDataPacket[]>(
      `SELECT r.audience_category, COUNT(*) AS sessions, COALESCE(SUM(r.participant_count), 0) AS participants
         FROM tbl_elearning_field_reports r
        WHERE ${rs.sql}
        GROUP BY r.audience_category
        ORDER BY sessions DESC`,
      rs.params,
    );

    // ── 28-day trend: sessions + module views ───────────────────────────────
    const [daily] = await pool.query<RowDataPacket[]>(
      `SELECT d, SUM(sessions) AS sessions, SUM(participants) AS participants, SUM(views) AS views FROM (
         SELECT DATE(r.created_at) AS d, COUNT(*) AS sessions, SUM(r.participant_count) AS participants, 0 AS views
           FROM tbl_elearning_field_reports r
          WHERE ${rs.sql} AND DATE(r.created_at) BETWEEN ? AND ?
          GROUP BY DATE(r.created_at)
         UNION ALL
         SELECT DATE(v.created_at) AS d, 0, 0, COUNT(*)
           FROM tbl_elearning_module_views v
          WHERE ${vs.sql} AND DATE(v.created_at) BETWEEN ? AND ?
          GROUP BY DATE(v.created_at)
       ) t GROUP BY d`,
      [...rs.params, window.from, window.to, ...vs.params, window.from, window.to],
    );

    return { window, breakdown_level, summary, views_summary, trainer_pool, top_modules, top_trainers, activities, breakdown, audience_mix, daily };
  },
};
