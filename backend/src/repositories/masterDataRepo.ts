import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool } from '../database/db';

export const LEGACY_TYPES = ['instansi', 'organisasi', 'satker', 'sub_org'] as const;
export type LegacyType = (typeof LEGACY_TYPES)[number];
export type MasterType = 'provinsi' | 'kota' | LegacyType;

/** Hierarchy: instansi -> organisasi -> satker -> sub_org (all inside db_elearning). */
export const LEGACY_META: Record<LegacyType, { table: string; prefix: string; parentCol: string | null; parentType: LegacyType | null; userCol: string }> = {
  instansi: { table: 'tbl_elearning_master_instansi', prefix: 'ins', parentCol: null, parentType: null, userCol: 'legacy_instansi_id' },
  organisasi: { table: 'tbl_elearning_master_organisasi', prefix: 'org', parentCol: 'instansi_id', parentType: 'instansi', userCol: 'legacy_org_id' },
  satker: { table: 'tbl_elearning_master_satker', prefix: 'stk', parentCol: 'organisasi_id', parentType: 'organisasi', userCol: 'legacy_satker_id' },
  sub_org: { table: 'tbl_elearning_master_sub_org', prefix: 'sub', parentCol: 'satker_id', parentType: 'satker', userCol: 'legacy_sub_org_id' },
};

export interface ProvinsiRecord {
  id: number;
  nama: string;
  kode: string | null;
  kota_count: number;
  user_count: number;
}

export interface KotaRecord {
  id: number;
  provinsi_id: number;
  provinsi_nama: string;
  nama: string;
  kode: string | null;
  user_count: number;
}

export interface LegacyRecord {
  id: string;
  nama: string;
  parent_id: string | null;
  parent_nama: string | null;
  user_count: number;
  child_count: number;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export const masterDataRepo = {
  // ── provinsi ────────────────────────────────────────────────────────────────
  async listProvinsi(): Promise<ProvinsiRecord[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT p.id, p.nama, p.kode,
              (SELECT COUNT(*) FROM tbl_elearning_kota k WHERE k.provinsi_id = p.id) AS kota_count,
              (SELECT COUNT(*) FROM tbl_elearning_users u WHERE u.provinsi_id = p.id) AS user_count
         FROM tbl_elearning_provinsi p ORDER BY p.nama`,
    );
    return rows.map((r) => ({ id: Number(r.id), nama: r.nama, kode: r.kode, kota_count: Number(r.kota_count), user_count: Number(r.user_count) }));
  },

  async provinsiExists(nama: string): Promise<boolean> {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT 1 FROM tbl_elearning_provinsi WHERE nama = ? LIMIT 1`, [nama]);
    return rows.length > 0;
  },

  async createProvinsi(nama: string, kode: string | null): Promise<ProvinsiRecord> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const [[{ next }]] = await conn.query<RowDataPacket[]>(`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM tbl_elearning_provinsi FOR UPDATE`);
      await conn.query(`INSERT INTO tbl_elearning_provinsi (id, nama, kode) VALUES (?, ?, ?)`, [next, nama, kode]);
      await conn.commit();
      return { id: Number(next), nama, kode, kota_count: 0, user_count: 0 };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  // ── kota ────────────────────────────────────────────────────────────────────
  async listKota(provinsiId: number | null): Promise<KotaRecord[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT k.id, k.provinsi_id, p.nama AS provinsi_nama, k.nama, k.kode,
              (SELECT COUNT(*) FROM tbl_elearning_users u WHERE u.kota_id = k.id) AS user_count
         FROM tbl_elearning_kota k
         JOIN tbl_elearning_provinsi p ON p.id = k.provinsi_id
        ${provinsiId ? 'WHERE k.provinsi_id = ?' : ''}
        ORDER BY p.nama, k.nama`,
      provinsiId ? [provinsiId] : [],
    );
    return rows.map((r) => ({ id: Number(r.id), provinsi_id: Number(r.provinsi_id), provinsi_nama: r.provinsi_nama, nama: r.nama, kode: r.kode, user_count: Number(r.user_count) }));
  },

  async kotaExists(provinsiId: number, nama: string): Promise<boolean> {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT 1 FROM tbl_elearning_kota WHERE provinsi_id = ? AND nama = ? LIMIT 1`, [provinsiId, nama]);
    return rows.length > 0;
  },

  async createKota(provinsiId: number, nama: string, kode: string | null): Promise<KotaRecord> {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const [[prov]] = await conn.query<RowDataPacket[]>(`SELECT nama FROM tbl_elearning_provinsi WHERE id = ?`, [provinsiId]);
      if (!prov) throw Object.assign(new Error('Provinsi not found'), { status: 404 });
      const [[{ next }]] = await conn.query<RowDataPacket[]>(`SELECT COALESCE(MAX(id), 0) + 1 AS next FROM tbl_elearning_kota FOR UPDATE`);
      await conn.query(`INSERT INTO tbl_elearning_kota (id, provinsi_id, nama, kode) VALUES (?, ?, ?, ?)`, [next, provinsiId, nama, kode]);
      await conn.commit();
      return { id: Number(next), provinsi_id: provinsiId, provinsi_nama: prov.nama, nama, kode, user_count: 0 };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  // ── instansi / organisasi / satker / sub_org ────────────────────────────────
  /**
   * Cascade for dropdowns: direct children of `parentId`; when the parent has NO children yet
   * (legacy rows without hierarchy), falls back to the unassigned rows so the form never dead-ends.
   * The response says which of the two it returned.
   */
  async listChildren(type: LegacyType, parentId: string): Promise<{ rows: LegacyRecord[]; fallback: boolean }> {
    const rows = await this.listLegacy(type, parentId, false);
    if (rows.length) return { rows, fallback: false };
    const unassigned = (await this.listLegacy(type, parentId, true)).filter((r) => r.parent_id === null);
    return { rows: unassigned, fallback: true };
  },

  /**
   * Lists a level, cascaded by parent: `?parent=X` returns ONLY the children of X.
   * Pass `includeUnassigned` (admin curation screens) to also list rows with no parent yet.
   */
  async listLegacy(type: LegacyType, parentId: string | null = null, includeUnassigned = false): Promise<LegacyRecord[]> {
    const m = LEGACY_META[type];
    const parentTable = m.parentType ? LEGACY_META[m.parentType].table : null;
    const childMeta = (Object.values(LEGACY_META) as Array<(typeof LEGACY_META)[LegacyType]>).find((c) => c.parentType === type);
    const where = m.parentCol && parentId ? (includeUnassigned ? `WHERE (l.${m.parentCol} = ? OR l.${m.parentCol} IS NULL)` : `WHERE l.${m.parentCol} = ?`) : '';
    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT l.id, l.nama,
              ${m.parentCol ? `l.${m.parentCol}` : 'NULL'} AS parent_id,
              ${parentTable ? 'p.nama' : 'NULL'} AS parent_nama,
              (SELECT COUNT(*) FROM tbl_elearning_users u WHERE u.${m.userCol} = l.id) AS user_count,
              ${childMeta ? `(SELECT COUNT(*) FROM ${childMeta.table} c WHERE c.${childMeta.parentCol} = l.id)` : '0'} AS child_count
         FROM ${m.table} l
         ${parentTable ? `LEFT JOIN ${parentTable} p ON p.id = l.${m.parentCol}` : ''}
         ${where}
         ORDER BY ${m.parentCol ? `(l.${m.parentCol} IS NULL), ` : ''}l.nama`,
      m.parentCol && parentId ? [parentId] : [],
    );
    return rows.map((r) => ({ id: r.id, nama: r.nama, parent_id: r.parent_id ?? null, parent_nama: r.parent_nama ?? null, user_count: Number(r.user_count), child_count: Number(r.child_count) }));
  },

  async legacyExists(type: LegacyType, id: string): Promise<{ id: string; parent_id: string | null } | null> {
    const m = LEGACY_META[type];
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT id, ${m.parentCol ? m.parentCol : 'NULL'} AS parent_id FROM ${m.table} WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ? { id: rows[0].id, parent_id: rows[0].parent_id ?? null } : null;
  },

  async legacyNameExists(type: LegacyType, nama: string): Promise<boolean> {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT 1 FROM ${LEGACY_META[type].table} WHERE nama = ? LIMIT 1`, [nama]);
    return rows.length > 0;
  },

  /** Slug id in the legacy convention (`ins-<slug>`), de-duplicated with a numeric suffix. */
  async createLegacy(type: LegacyType, nama: string, parentId: string | null): Promise<LegacyRecord> {
    const m = LEGACY_META[type];
    const base = `${m.prefix}-${slugify(nama) || 'item'}`;
    const [taken] = await getPool().query<RowDataPacket[]>(`SELECT id FROM ${m.table} WHERE id = ? OR id LIKE ?`, [base, `${base}-%`]);
    const ids = new Set(taken.map((r) => r.id as string));
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;

    const cols = m.parentCol ? `(id, nama, ${m.parentCol})` : '(id, nama)';
    const vals = m.parentCol ? [id, nama, parentId] : [id, nama];
    const [res] = await getPool().query<ResultSetHeader>(`INSERT INTO ${m.table} ${cols} VALUES (${vals.map(() => '?').join(', ')})`, vals);
    if (res.affectedRows !== 1) throw new Error('Insert failed');
    const [row] = await this.listLegacy(type).then((rows) => rows.filter((r) => r.id === id));
    return row;
  },

  /** Admin curation: (re)assign the parent of an existing row. */
  async setLegacyParent(type: LegacyType, id: string, parentId: string | null): Promise<boolean> {
    const m = LEGACY_META[type];
    if (!m.parentCol) return false;
    const [res] = await getPool().query<ResultSetHeader>(`UPDATE ${m.table} SET ${m.parentCol} = ? WHERE id = ?`, [parentId, id]);
    return res.affectedRows > 0;
  },

  /**
   * Validates an instansi -> organisasi -> satker -> sub_org selection.
   * Each child must exist and, when it has a parent set, that parent must match the selected ancestor.
   * Unassigned rows (parent NULL) are accepted under any ancestor.
   */
  async validateChain(chain: { instansi: string | null; organisasi: string | null; satker: string | null; sub_org: string | null }): Promise<Record<string, string>> {
    const errors: Record<string, string> = {};
    const check = async (type: LegacyType, id: string | null, expectedParent: string | null, field: string, label: string) => {
      if (!id) return null;
      const row = await this.legacyExists(type, id);
      if (!row) {
        errors[field] = `Unknown ${label}`;
        return null;
      }
      if (row.parent_id && expectedParent && row.parent_id !== expectedParent) errors[field] = `${label} does not belong to the selected ${LEGACY_META[type].parentType}`;
      return row.id;
    };
    const ins = await check('instansi', chain.instansi, null, 'legacy_instansi_id', 'instansi');
    const org = await check('organisasi', chain.organisasi, ins, 'legacy_org_id', 'organisasi');
    const stk = await check('satker', chain.satker, org, 'legacy_satker_id', 'satuan kerja');
    // Strict hierarchy: a child level requires its parent level to be selected.
    if (chain.organisasi && !chain.instansi) errors.legacy_org_id = 'Choose an instansi first';
    if (chain.satker && !chain.organisasi) errors.legacy_satker_id = 'Choose an organisasi first';
    if (chain.sub_org && !chain.satker) errors.legacy_sub_org_id = 'Choose a satuan kerja first';
    await check('sub_org', chain.sub_org, stk, 'legacy_sub_org_id', 'sub organisasi');
    return errors;
  },
};
