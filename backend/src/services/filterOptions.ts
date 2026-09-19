import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';
import { UserPayload } from '../middlewares/authenticate';
import { ROLE } from '../middlewares/rbacGuard';
import { AnalyticsFilters, resolveFilters, territorySql } from './scope';

export interface FilterOption { id: number | string; nama: string }

export interface FilterOptions {
  locked: { provinsi: boolean; kota: boolean; instansi: boolean };
  selected: AnalyticsFilters;
  provinsi: FilterOption[];
  kota: FilterOption[];
  /** Nasional: every instansi that has trainers inside the chosen territory; Provinsi/Kota: own instansi only (locked) */
  instansi: FilterOption[];
  satker: FilterOption[];
  names: { provinsi: string | null; kota: string | null; instansi: string | null; satker: string | null };
}

/**
 * Options for the executive filter bar, bounded by role:
 *  - Nasional: every provinsi; kota of the chosen provinsi
 *  - Provinsi: own provinsi only (locked); every kota inside it
 *  - Kota: both locked
 *  - Instansi: Nasional picks any instansi with trainers in the territory; Provinsi/Kota are locked to their own
 *  - Satuan kerja: units that actually have trainers inside the current territory (and instansi)
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

  // Instansi list ignores the instansi/satker filters themselves (so the dropdown keeps every option) but honours territory.
  const is = territorySql(user, 'u', { ...filters, instansi_id: null, satker_id: null });
  const [instansi] = locked.instansi
    ? await pool.query<RowDataPacket[]>(`SELECT id, nama FROM tbl_elearning_master_instansi WHERE id = ?`, [filters.instansi_id])
    : await pool.query<RowDataPacket[]>(
        `SELECT DISTINCT li.id, li.nama
           FROM tbl_elearning_users u
           JOIN tbl_elearning_master_instansi li ON li.id = u.legacy_instansi_id
          WHERE ${is.sql} AND u.role_level = ${ROLE.TRAINER}
          ORDER BY li.nama`,
        is.params,
      );

  // Satker list ignores the satker filter itself (so the dropdown keeps every option) but honours territory + instansi.
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
    instansi: instansi.map((r) => ({ id: String(r.id), nama: r.nama })),
    satker: satker.map((r) => ({ id: String(r.id), nama: r.nama })),
    names: { provinsi: name(provinsi, filters.provinsi_id), kota: name(kota, filters.kota_id), instansi: name(instansi, filters.instansi_id), satker: name(satker, filters.satker_id) },
  };
}

/** Names only for the dimensions the caller narrowed themselves (locked ones are already in the base scope label). */
export const chosenNames = (o: FilterOptions) => ({
  provinsi: o.locked.provinsi ? null : o.names.provinsi,
  kota: o.locked.kota ? null : o.names.kota,
  instansi: o.locked.instansi ? null : o.names.instansi,
  satker: o.names.satker,
});
