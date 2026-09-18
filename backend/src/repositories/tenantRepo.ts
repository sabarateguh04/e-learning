import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';

export interface TenantRow extends RowDataPacket {
  id: string;
  name: string;
  subdomain: string;
  legacy_instansi_id: string | null;
  instansi_name: string | null;
  theme_color: string;
  is_active: number;
}

const SELECT = `
  SELECT t.id, t.name, t.subdomain, t.legacy_instansi_id, t.theme_color, t.is_active, li.nama AS instansi_name
    FROM tbl_elearning_tenants t
    LEFT JOIN tbl_elearning_master_instansi li ON li.id = t.legacy_instansi_id`;

export const tenantRepo = {
  async findById(id: string): Promise<TenantRow | null> {
    const [rows] = await getPool().query<TenantRow[]>(`${SELECT} WHERE t.id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  },

  async findByIdOrSubdomain(hint: string): Promise<TenantRow | null> {
    const [rows] = await getPool().query<TenantRow[]>(`${SELECT} WHERE t.id = ? OR t.subdomain = ? LIMIT 1`, [hint, hint]);
    return rows[0] ?? null;
  },

  async list(): Promise<TenantRow[]> {
    const [rows] = await getPool().query<TenantRow[]>(`${SELECT} WHERE t.is_active = 1 ORDER BY t.name`);
    return rows;
  },
};
