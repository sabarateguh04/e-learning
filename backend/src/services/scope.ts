import { UserPayload } from '../middlewares/authenticate';
import { ROLE } from '../middlewares/rbacGuard';

export interface ScopeDescriptor {
  role_level: number;
  scope: 'TENANT' | 'PROVINCE' | 'CITY' | 'SELF';
  label: string;
}

export interface SqlFragment {
  sql: string;
  params: unknown[];
}

/**
 * Optional drill-down filters an executive may apply on top of their scope.
 * Every value is already clamped by `resolveFilters()` — a Provinsi executive can
 * never widen to another provinsi, a Kota executive can never leave their kota.
 */
export interface AnalyticsFilters {
  provinsi_id: number | null;
  kota_id: number | null;
  /** tbl_elearning_master_satker.id of the trainer's unit */
  satker_id: string | null;
  /** YYYY-MM-DD, inclusive */
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTERS: AnalyticsFilters = { provinsi_id: null, kota_id: null, satker_id: null, from: null, to: null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
const toInt = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
};
const toDate = (v: unknown): string | null => (typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

/**
 * Reads ?provinsi_id=&kota_id=&satker_id=&from=&to= and clamps them to the caller's territory.
 * Returns the effective filters plus which dimensions are locked by role.
 */
export const resolveFilters = (user: UserPayload, query: Record<string, unknown>): { filters: AnalyticsFilters; locked: { provinsi: boolean; kota: boolean } } => {
  let provinsi_id = toInt(query.provinsi_id);
  let kota_id = toInt(query.kota_id);
  const satker_id = typeof query.satker_id === 'string' && /^[\w.-]{1,50}$/.test(query.satker_id) ? query.satker_id : null;
  let from = toDate(query.from);
  let to = toDate(query.to);
  if (from && to && from > to) [from, to] = [to, from];
  if (from && to && (Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS) from = new Date(Date.parse(to) - MAX_RANGE_DAYS * 86_400_000).toISOString().slice(0, 10);

  const locked = { provinsi: user.role_level >= ROLE.EXEC_PROVINCE, kota: user.role_level >= ROLE.EXEC_CITY };
  return { filters: clamp(user, { provinsi_id, kota_id, satker_id, from, to }), locked };
};

/**
 * Role fence applied to EVERY query builder below, whether or not the caller passed filters:
 * a Provinsi executive is pinned to their provinsi, a Kota executive to their kota.
 * (Trainers are pinned to their own rows by trainer_id instead — see reportScopeSql.)
 */
const clamp = (user: UserPayload, f: AnalyticsFilters): AnalyticsFilters => {
  switch (user.role_level) {
    case ROLE.EXEC_PROVINCE:
      return { ...f, provinsi_id: user.provinsi_id ?? -1 };
    case ROLE.EXEC_CITY:
      return { ...f, provinsi_id: user.provinsi_id ?? -1, kota_id: user.kota_id ?? -1 };
    default:
      return f;
  }
};

const SATKER_TRAINERS = `SELECT su.id FROM tbl_elearning_users su WHERE su.legacy_satker_id = ?`;

/**
 * Bottom-up data scoping for tbl_elearning_field_reports, as a WHERE fragment.
 *
 *   0 / 1  -> every report in the tenant
 *   2      -> reports inside the user's provinsi
 *   3      -> reports inside the user's kota
 *   4      -> reports the user submitted
 *
 * `filters` (already clamped) narrow further: provinsi/kota/satker of the trainer and an activity-date range.
 */
export const reportScopeSql = (user: UserPayload, alias = 'r', raw: AnalyticsFilters = EMPTY_FILTERS): SqlFragment => {
  const filters = clamp(user, raw);
  const where = [`${alias}.tenant_id = ?`];
  const params: unknown[] = [user.tenant_id];
  if (user.role_level === ROLE.TRAINER) {
    where.push(`${alias}.trainer_id = ?`);
    params.push(user.id);
  }
  if (filters.provinsi_id !== null) { where.push(`${alias}.provinsi_id = ?`); params.push(filters.provinsi_id); }
  if (filters.kota_id !== null) { where.push(`${alias}.kota_id = ?`); params.push(filters.kota_id); }
  if (filters.satker_id) { where.push(`${alias}.trainer_id IN (${SATKER_TRAINERS})`); params.push(filters.satker_id); }
  if (filters.from) { where.push(`COALESCE(${alias}.report_date, DATE(${alias}.created_at)) >= ?`); params.push(filters.from); }
  if (filters.to) { where.push(`COALESCE(${alias}.report_date, DATE(${alias}.created_at)) <= ?`); params.push(filters.to); }
  return { sql: where.join(' AND '), params };
};

/**
 * Territory fence for tables that carry tenant_id / provinsi_id / kota_id
 * (`u` = users, `v` = module_views). Same bottom-up rule, plus the drill-down filters.
 * Pass `withDates` for event tables so the date range applies to created_at.
 */
export const territorySql = (user: UserPayload, alias: string, raw: AnalyticsFilters = EMPTY_FILTERS, opts: { withDates?: boolean; userIdColumn?: string } = {}): SqlFragment => {
  const filters = clamp(user, raw);
  const where = [`${alias}.tenant_id = ?`];
  const params: unknown[] = [user.tenant_id];
  if (filters.provinsi_id !== null) { where.push(`${alias}.provinsi_id = ?`); params.push(filters.provinsi_id); }
  if (filters.kota_id !== null) { where.push(`${alias}.kota_id = ?`); params.push(filters.kota_id); }
  if (filters.satker_id) {
    const col = opts.userIdColumn ?? 'id';
    where.push(col === 'id' && alias === 'u' ? `${alias}.legacy_satker_id = ?` : `${alias}.${col} IN (${SATKER_TRAINERS})`);
    params.push(filters.satker_id);
  }
  if (opts.withDates) {
    if (filters.from) { where.push(`DATE(${alias}.created_at) >= ?`); params.push(filters.from); }
    if (filters.to) { where.push(`DATE(${alias}.created_at) <= ?`); params.push(filters.to); }
  }
  return { sql: where.join(' AND '), params };
};

/** Effective trend window: the requested range (capped) or the trailing 28 days. */
export const trendWindow = (filters: AnalyticsFilters): { from: string; to: string; days: number } => {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const to = filters.to ?? iso(today);
  const from = filters.from ?? iso(new Date(Date.parse(to) - 27 * 86_400_000));
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
  return { from, to, days };
};

export const describeScope = (user: UserPayload, filters?: AnalyticsFilters, names?: { provinsi?: string | null; kota?: string | null; satker?: string | null }): ScopeDescriptor => {
  const base = (): ScopeDescriptor => {
    switch (user.role_level) {
      case ROLE.SUPER_ADMIN:
      case ROLE.EXEC_NATIONAL:
        return { role_level: user.role_level, scope: 'TENANT', label: 'Nasional · semua provinsi' };
      case ROLE.EXEC_PROVINCE:
        return { role_level: user.role_level, scope: 'PROVINCE', label: `Provinsi · ${user.provinsi_name ?? '—'}` };
      case ROLE.EXEC_CITY:
        return { role_level: user.role_level, scope: 'CITY', label: `Kota · ${user.kota_name ?? '—'}` };
      default:
        return { role_level: user.role_level, scope: 'SELF', label: 'Laporan saya' };
    }
  };
  const d = base();
  if (!filters) return d;
  const parts: string[] = [];
  if (names?.kota) parts.push(names.kota);
  else if (names?.provinsi) parts.push(names.provinsi);
  if (names?.satker) parts.push(names.satker);
  if (filters.from || filters.to) parts.push(`${filters.from ?? '…'} s.d. ${filters.to ?? '…'}`);
  return parts.length ? { ...d, label: `${d.label} › ${parts.join(' · ')}` } : d;
};
