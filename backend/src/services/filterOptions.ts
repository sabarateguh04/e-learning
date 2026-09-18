import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';
import { UserPayload } from '../middlewares/authenticate';
import { ROLE } from '../middlewares/rbacGuard';
import { AnalyticsFilters, resolveFilters, territorySql } from './scope';

export interface FilterOption { id: number | string; nama: string }

export interface FilterOptions {
  locked: { provinsi: boolean; kota: boolean };
  selected: AnalyticsFilters;
  provinsi: FilterOption[];
  kota: FilterOption[];
  satker: FilterOption[];
  names: { provinsi: string | null; kota: string | null; satker: string | null };
}

/**
 * Options for the executive filter bar, bounded by role:
 *  - Nasional: every provinsi; kota of the chosen provinsi
 *  - Provinsi: own provinsi only (locked); every kota inside it
 *  - Kota: both locked
 *  - Satuan kerja: units that actually have trainers inside the current territory
 */
export async function loadFilterOptions(user: UserPayload, query: Record<string, unknown>): Promise<FilterOptions> {
  const pool = getPool();
  const { filters, locked } = resolveFilters(user, query);

  const [provinsi] =
    user.role_level <= ROLE.EXEC_NATIONAL
      ? await pool.query<RowDataPacket[]>(`SELECT id, nama FROM tbl_elearning_provinsi ORDER BY nama`)
      : await pool.query<RowDataPacket[]>(`SELECT id, nama FROM tbl_elearning_provinsi WHERE id = ?`, [user.provinsi_id ?? -1]);

  const kotaProv = filters.provinsi_id;
  const [kota] =
    user.role_level >= ROLE.EXEC_CITY
      ? await pool.query<RowDataPacket[]>(`SELECT id, nama FROM tbl_elearning_kota WHERE id = ?`, [user.kota_id ?? -1])
      : kotaProv !== null
        ? await pool.query<RowDataPacket[]>(`SELECT id, nama FROM tbl_elearning_kota WHERE provinsi_id = ? ORDER BY nama`, [kotaProv])
        : [[] as RowDataPacket[]];

  // Satker list ignores the satker filter itself (so the dropdown keeps every option) but honours territory.
  const ts = territorySql(user, 'u', { ...filters, satker_id: null });
  const [satker] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT s.id, s.nama
       FROM tbl_elearning_users u
       JOIN tbl_elearning_master_satker s ON s.id = u.legacy_satker_id
      WHERE ${ts.sql} AND u.role_level = ${ROLE.TRAINER}
      ORDER BY s.nama`,
    ts.params,
  );

  const name = (rows: RowDataPacket[], id: number | string | null) => (id === null ? null : (rows.find((r) => String(r.id) === String(id))?.nama as string | undefined) ?? null);
  return {
    locked,
    selected: filters,
    provinsi: provinsi.map((r) => ({ id: Number(r.id), nama: r.nama })),
    kota: kota.map((r) => ({ id: Number(r.id), nama: r.nama })),
    satker: satker.map((r) => ({ id: String(r.id), nama: r.nama })),
    names: { provinsi: name(provinsi, filters.provinsi_id), kota: name(kota, filters.kota_id), satker: name(satker, filters.satker_id) },
  };
}

/** Names only for the dimensions the caller narrowed themselves (locked ones are already in the base scope label). */
export const chosenNames = (o: FilterOptions) => ({
  provinsi: o.locked.provinsi ? null : o.names.provinsi,
  kota: o.locked.kota ? null : o.names.kota,
  satker: o.names.satker,
});
