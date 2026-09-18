import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';

export interface ProvinsiRow extends RowDataPacket {
  id: number;
  nama: string;
  kode: string | null;
}

export interface KotaRow extends RowDataPacket {
  id: number;
  provinsi_id: number;
  nama: string;
  kode: string | null;
}

export interface LegacyOption extends RowDataPacket {
  id: string;
  nama: string;
  parent_id: string | null;
}

export interface LegacyMasters {
  instansi: LegacyOption[];
  organisasi: LegacyOption[];
  satker: LegacyOption[];
  sub_org: LegacyOption[];
}

export const regionRepo = {
  async provinsi(): Promise<ProvinsiRow[]> {
    const [rows] = await getPool().query<ProvinsiRow[]>(`SELECT id, nama, kode FROM tbl_elearning_provinsi ORDER BY nama`);
    return rows;
  },

  async kota(): Promise<KotaRow[]> {
    const [rows] = await getPool().query<KotaRow[]>(`SELECT id, provinsi_id, nama, kode FROM tbl_elearning_kota ORDER BY provinsi_id, nama`);
    return rows;
  },

  async kotaBelongsToProvinsi(kotaId: number, provinsiId: number): Promise<boolean> {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT 1 FROM tbl_elearning_kota WHERE id = ? AND provinsi_id = ? LIMIT 1`, [kotaId, provinsiId]);
    return rows.length > 0;
  },

  /** Full master hierarchy with parent ids (lets a client cascade without extra round-trips). */
  async legacyMasters(): Promise<LegacyMasters> {
    const pool = getPool();
    const fetch = async (table: string, parentCol: string | null) =>
      (await pool.query<LegacyOption[]>(`SELECT id, nama, ${parentCol ?? 'NULL'} AS parent_id FROM ${table} ORDER BY nama`))[0];
    const [instansi, organisasi, satker, sub_org] = await Promise.all([
      fetch('tbl_elearning_master_instansi', null),
      fetch('tbl_elearning_master_organisasi', 'instansi_id'),
      fetch('tbl_elearning_master_satker', 'organisasi_id'),
      fetch('tbl_elearning_master_sub_org', 'satker_id'),
    ]);
    return { instansi, organisasi, satker, sub_org };
  },
};
