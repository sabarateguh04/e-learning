import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool } from '../database/db';
import { UserPayload } from '../middlewares/authenticate';
import { catalogueInstansi } from '../services/scope';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ModuleAttachment {
  id: string;
  title: string;
  pdf_url: string;
  pages: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer_index: number;
}

export interface QuizData {
  pass_score: number;
  time_limit_minutes: number;
  questions: QuizQuestion[];
}

export interface ModuleRow extends RowDataPacket {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  /** Institution of the author (master instansi), falling back to the tenant name. */
  instansi_name: string | null;
  created_by: string | null;
  author_id: string | null;
  author_name: string | null;
  title: string;
  description: string | null;
  content_text: string | null;
  quiz_data: string | QuizData | null;
  category: string | null;
  target_audience: string | null;
  instructor_name: string | null;
  video_url: string | null;
  pdf_url: string | null;
  thumbnail_url: string | null;
  attachments_json: string | ModuleAttachment[] | null;
  duration_minutes: number;
  has_quiz: number;
  view_count: number;
  presentation_count: number;
  public_view_count: number;
  approval_status: ApprovalStatus;
  published_at: Date | null;
  created_at: Date;
}

/** Public shape used by the API (JSON columns parsed, booleans normalised). */
export interface LearningModule {
  id: string;
  tenant_id: string | null;
  tenant_name: string | null;
  instansi_name: string | null;
  author_id: string | null;
  author_name: string | null;
  title: string;
  description: string;
  content_text: string | null;
  quiz: QuizData | null;
  category: string;
  target_audience: string;
  instructor_name: string;
  video_url: string | null;
  pdf_url: string | null;
  thumbnail_url: string | null;
  attachments: ModuleAttachment[];
  duration_minutes: number;
  has_quiz: boolean;
  metrics: { views: number; presentations: number; public_views: number };
  approval_status: ApprovalStatus;
  published_at: string | null;
  created_at: string;
}

const parseJson = <T>(v: string | T | null): T | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
};

export const toModule = (r: ModuleRow): LearningModule => ({
  id: r.id,
  tenant_id: r.tenant_id,
  tenant_name: r.tenant_name,
  instansi_name: r.instansi_name ?? r.tenant_name,
  author_id: r.author_id,
  author_name: r.author_name,
  title: r.title,
  description: r.description ?? '',
  content_text: r.content_text,
  quiz: parseJson<QuizData>(r.quiz_data),
  category: r.category ?? 'General',
  target_audience: r.target_audience ?? 'Umum',
  instructor_name: r.instructor_name ?? r.author_name ?? '—',
  video_url: r.video_url,
  pdf_url: r.pdf_url,
  thumbnail_url: r.thumbnail_url,
  attachments: parseJson<ModuleAttachment[]>(r.attachments_json) ?? [],
  duration_minutes: r.duration_minutes,
  has_quiz: Boolean(r.has_quiz),
  metrics: { views: Number(r.view_count), presentations: Number(r.presentation_count), public_views: Number(r.public_view_count) },
  approval_status: r.approval_status,
  published_at: r.published_at ? new Date(r.published_at).toISOString() : null,
  created_at: new Date(r.created_at).toISOString(),
});

export interface CreateModuleInput {
  id: string;
  tenant_id: string | null;
  created_by: string;
  author_id: string;
  title: string;
  description: string | null;
  content_text: string | null;
  quiz: QuizData | null;
  category: string;
  target_audience: string;
  instructor_name: string;
  video_url: string | null;
  pdf_url: string | null;
  duration_minutes: number;
  approval_status: ApprovalStatus;
}

const SELECT = `
  SELECT m.*, t.name AS tenant_name, a.full_name AS author_name, COALESCE(li.nama, t.name) AS instansi_name
    FROM tbl_elearning_modules m
    LEFT JOIN tbl_elearning_tenants t ON t.id = m.tenant_id
    LEFT JOIN tbl_elearning_users a ON a.id = m.author_id
    LEFT JOIN tbl_elearning_master_instansi li ON li.id = a.legacy_instansi_id`;

/**
 * Catalogue visibility: APPROVED modules only. Nasional / Super Admin see every institution's
 * modules; Provinsi, Kota and Trainer accounts see their own instansi's modules plus platform
 * modules whose author carries no instansi (see services/scope.ts `catalogueInstansi`).
 */
const VISIBLE = `m.approval_status = 'APPROVED'`;
/** main-tenant: the signed-in catalogue never crosses tenants (the public portal stays global). */
const visibleFor = (user: UserPayload): { sql: string; params: unknown[] } => {
  const instansi = catalogueInstansi(user);
  const sql = `${VISIBLE} AND m.tenant_id = ?`;
  return instansi ? { sql: `${sql} AND (a.legacy_instansi_id IS NULL OR a.legacy_instansi_id = ?)`, params: [user.tenant_id, instansi] } : { sql, params: [user.tenant_id] };
};

export const moduleRepo = {
  async listVisible(user: UserPayload): Promise<LearningModule[]> {
    const v = visibleFor(user);
    const [rows] = await getPool().query<ModuleRow[]>(`${SELECT} WHERE ${v.sql} ORDER BY m.published_at DESC, m.title`, v.params);
    return rows.map(toModule);
  },

  async findVisibleById(user: UserPayload, id: string): Promise<LearningModule | null> {
    const v = visibleFor(user);
    const [rows] = await getPool().query<ModuleRow[]>(`${SELECT} WHERE m.id = ? AND ${v.sql} LIMIT 1`, [id, ...v.params]);
    return rows[0] ? toModule(rows[0]) : null;
  },

  /**
   * Most-viewed approved modules for the executive dashboard, counted from the access log
   * inside the caller's territory/date filter (`viewScope` = WHERE fragment on alias `v`).
   */
  async topViewed(viewScope: { sql: string; params: unknown[] }, limit = 5): Promise<Array<{ module_id: string; title: string; target_audience: string; views: number; public_views: number; presentations: number }>> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT m.id, m.title, m.target_audience,
              COALESCE(SUM(v.kind = 'VIEW'), 0) AS views,
              COALESCE(SUM(v.kind = 'PUBLIC'), 0) AS public_views,
              COALESCE(SUM(v.kind = 'PRESENTATION'), 0) AS presentations
         FROM tbl_elearning_modules m
         LEFT JOIN tbl_elearning_module_views v ON v.module_id = m.id AND ${viewScope.sql}
        WHERE m.approval_status = 'APPROVED'
        GROUP BY m.id, m.title, m.target_audience
        ORDER BY (COALESCE(SUM(v.kind = 'VIEW'), 0) + COALESCE(SUM(v.kind = 'PUBLIC'), 0)) DESC, presentations DESC, m.title LIMIT ?`,
      [...viewScope.params, limit],
    );
    return rows.map((r) => ({ module_id: r.id, title: r.title, target_audience: r.target_audience, views: Number(r.views), public_views: Number(r.public_views), presentations: Number(r.presentations) }));
  },

  /** Public catalogue: every APPROVED module with its viewer counters (no auth). */
  async listPublic(filters: { instansi_id?: string | null; audience?: string | null } = {}): Promise<Array<LearningModule & { instansi_id: string | null; instansi_name: string | null }>> {
    // Origin institution = the author's instansi (master data), falling back to the owning tenant.
    const where = [`m.approval_status = 'APPROVED'`];
    const params: unknown[] = [];
    if (filters.instansi_id) { where.push(`COALESCE(li.id, t.id) = ?`); params.push(filters.instansi_id); }
    if (filters.audience) { where.push(`m.target_audience = ?`); params.push(filters.audience); }
    const [rows] = await getPool().query<(ModuleRow & { instansi_id: string | null; instansi_name: string | null })[]>(
      `SELECT m.*, t.name AS tenant_name, a.full_name AS author_name,
              COALESCE(li.id, t.id) AS instansi_id, COALESCE(li.nama, t.name) AS instansi_name
         FROM tbl_elearning_modules m
         LEFT JOIN tbl_elearning_tenants t ON t.id = m.tenant_id
         LEFT JOIN tbl_elearning_users a ON a.id = m.author_id
         LEFT JOIN tbl_elearning_master_instansi li ON li.id = a.legacy_instansi_id
        WHERE ${where.join(' AND ')}
        ORDER BY (m.view_count + m.public_view_count) DESC, m.published_at DESC, m.title`,
      params,
    );
    return rows.map((r) => ({ ...toModule(r), instansi_id: r.instansi_id, instansi_name: r.instansi_name }));
  },

  /** Institutions that have at least one approved module (facet for the public portal). */
  async publicInstansi(): Promise<Array<{ id: string; nama: string; modules: number }>> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT COALESCE(li.id, t.id) AS id, COALESCE(li.nama, t.name) AS nama, COUNT(*) AS modules
         FROM tbl_elearning_modules m
         LEFT JOIN tbl_elearning_tenants t ON t.id = m.tenant_id
         LEFT JOIN tbl_elearning_users a ON a.id = m.author_id
         LEFT JOIN tbl_elearning_master_instansi li ON li.id = a.legacy_instansi_id
        WHERE m.approval_status = 'APPROVED' AND COALESCE(li.id, t.id) IS NOT NULL
        GROUP BY COALESCE(li.id, t.id), COALESCE(li.nama, t.name)
        ORDER BY modules DESC, nama`,
    );
    return rows.map((r) => ({ id: String(r.id), nama: r.nama, modules: Number(r.modules) }));
  },

  async findById(id: string): Promise<LearningModule | null> {
    const [rows] = await getPool().query<ModuleRow[]>(`${SELECT} WHERE m.id = ? LIMIT 1`, [id]);
    return rows[0] ? toModule(rows[0]) : null;
  },

  /** Author's own modules, any approval status. */
  async listByAuthor(authorId: string): Promise<LearningModule[]> {
    const [rows] = await getPool().query<ModuleRow[]>(`${SELECT} WHERE m.author_id = ? ORDER BY m.created_at DESC`, [authorId]);
    return rows.map(toModule);
  },

  async create(input: CreateModuleInput): Promise<LearningModule> {
    await getPool().query(
      `INSERT INTO tbl_elearning_modules
         (id, tenant_id, created_by, author_id, title, description, content_text, quiz_data, category, target_audience, instructor_name,
          video_url, pdf_url, duration_minutes, has_quiz, approval_status, approved_by, approved_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id, input.tenant_id, input.created_by, input.author_id, input.title, input.description, input.content_text,
        input.quiz ? JSON.stringify(input.quiz) : null, input.category, input.target_audience, input.instructor_name,
        input.video_url, input.pdf_url, input.duration_minutes, input.quiz ? 1 : 0, input.approval_status,
        input.approval_status === 'APPROVED' ? input.created_by : null,
        input.approval_status === 'APPROVED' ? new Date() : null,
        input.approval_status === 'APPROVED' ? new Date() : null,
      ],
    );
    return (await this.findById(input.id))!;
  },

  /** Author/admin edit of authoring fields; approval handling is decided by the controller. */
  async update(id: string, input: Omit<CreateModuleInput, 'id' | 'tenant_id' | 'created_by' | 'author_id'>): Promise<LearningModule | null> {
    const [res] = await getPool().query<ResultSetHeader>(
      `UPDATE tbl_elearning_modules
          SET title = ?, description = ?, content_text = ?, quiz_data = ?, category = ?, target_audience = ?, instructor_name = ?,
              video_url = ?, pdf_url = ?, duration_minutes = ?, has_quiz = ?, approval_status = ?,
              approved_by = IF(? = 'APPROVED', approved_by, NULL), approved_at = IF(? = 'APPROVED', approved_at, NULL)
        WHERE id = ?`,
      [
        input.title, input.description, input.content_text, input.quiz ? JSON.stringify(input.quiz) : null, input.category, input.target_audience,
        input.instructor_name, input.video_url, input.pdf_url, input.duration_minutes, input.quiz ? 1 : 0, input.approval_status,
        input.approval_status, input.approval_status, id,
      ],
    );
    return res.affectedRows ? this.findById(id) : null;
  },

  /** Engagement metrics — atomic counters. */
  async increment(id: string, metric: 'view_count' | 'presentation_count' | 'public_view_count'): Promise<void> {
    await getPool().query(`UPDATE tbl_elearning_modules SET ${metric} = ${metric} + 1 WHERE id = ?`, [id]);
  },

  /** Append one access event with the viewer's territory (null for anonymous public views). */
  async logView(input: { tenant_id: string; module_id: string; kind: 'VIEW' | 'PUBLIC' | 'PRESENTATION'; user?: { id: string; provinsi_id: number | null; kota_id: number | null } | null }): Promise<void> {
    await getPool().query(
      `INSERT INTO tbl_elearning_module_views (tenant_id, module_id, user_id, provinsi_id, kota_id, kind) VALUES (?, ?, ?, ?, ?, ?)`,
      [input.tenant_id, input.module_id, input.user?.id ?? null, input.user?.provinsi_id ?? null, input.user?.kota_id ?? null, input.kind],
    );
  },

  /** Admin listing (all modules, any status). */
  async listForAdmin(status: ApprovalStatus | null): Promise<LearningModule[]> {
    const where = status ? 'WHERE m.approval_status = ?' : '';
    const [rows] = await getPool().query<ModuleRow[]>(
      `SELECT m.*, t.name AS tenant_name, a.full_name AS author_name, COALESCE(li.nama, t.name) AS instansi_name
         FROM tbl_elearning_modules m
         LEFT JOIN tbl_elearning_tenants t ON t.id = m.tenant_id
         LEFT JOIN tbl_elearning_users a ON a.id = m.author_id
         LEFT JOIN tbl_elearning_master_instansi li ON li.id = a.legacy_instansi_id
         ${where}
         ORDER BY FIELD(m.approval_status, 'PENDING', 'APPROVED', 'REJECTED'), m.created_at DESC`,
      status ? [status] : [],
    );
    return rows.map(toModule);
  },

  async countByStatus(): Promise<Record<ApprovalStatus, number>> {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT approval_status AS s, COUNT(*) AS n FROM tbl_elearning_modules GROUP BY approval_status`);
    const out: Record<ApprovalStatus, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const r of rows) out[r.s as ApprovalStatus] = Number(r.n);
    return out;
  },

  async setApproval(id: string, status: ApprovalStatus, adminId: string): Promise<boolean> {
    const [res] = await getPool().query<ResultSetHeader>(
      `UPDATE tbl_elearning_modules
          SET approval_status = ?, approved_by = ?, approved_at = IF(? = 'APPROVED', NOW(), approved_at),
              published_at = IF(? = 'APPROVED', COALESCE(published_at, NOW()), published_at)
        WHERE id = ?`,
      [status, adminId, status, status, id],
    );
    return res.affectedRows > 0;
  },
};
