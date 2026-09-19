import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';
import { APPROVAL_FLOWS, ApprovalFlow, VERTICALS, Vertical } from '../services/vocabulary';

export interface TenantRow extends RowDataPacket {
  id: string;
  name: string;
  subdomain: string;
  legacy_instansi_id: string | null;
  instansi_name: string | null;
  theme_color: string;
  is_active: number;
  /** from tbl_tenant_settings (defaults when the row is missing) */
  vertical: Vertical;
  approval_flow: ApprovalFlow;
}

const SELECT = `
  SELECT t.id, t.name, t.subdomain, t.legacy_instansi_id, t.theme_color, t.is_active, li.nama AS instansi_name,
         COALESCE(ts.vertical, 'pemerintahan') AS vertical, COALESCE(ts.approval_flow, 'TERRITORY') AS approval_flow
    FROM tbl_elearning_tenants t
    LEFT JOIN tbl_elearning_master_instansi li ON li.id = t.legacy_instansi_id
    LEFT JOIN tbl_tenant_settings ts ON ts.tenant_id = t.id`;

const normalise = (r: TenantRow): TenantRow => ({
  ...r,
  vertical: (VERTICALS as readonly string[]).includes(r.vertical) ? r.vertical : 'pemerintahan',
  approval_flow: (APPROVAL_FLOWS as readonly string[]).includes(r.approval_flow) ? r.approval_flow : 'TERRITORY',
} as TenantRow);

export const tenantRepo = {
  async findById(id: string): Promise<TenantRow | null> {
    const [rows] = await getPool().query<TenantRow[]>(`${SELECT} WHERE t.id = ? LIMIT 1`, [id]);
    return rows[0] ? normalise(rows[0]) : null;
  },

  async findByIdOrSubdomain(hint: string): Promise<TenantRow | null> {
    const [rows] = await getPool().query<TenantRow[]>(`${SELECT} WHERE t.id = ? OR t.subdomain = ? LIMIT 1`, [hint, hint]);
    return rows[0] ? normalise(rows[0]) : null;
  },

  async list(): Promise<TenantRow[]> {
    const [rows] = await getPool().query<TenantRow[]>(`${SELECT} WHERE t.is_active = 1 ORDER BY t.name`);
    return rows.map(normalise);
  },

  /** Upsert the per-tenant behaviour row (tbl_tenant_settings). */
  async saveSettings(tenantId: string, s: { vertical: Vertical; approval_flow: ApprovalFlow }): Promise<void> {
    await getPool().query(
      `INSERT INTO tbl_tenant_settings (tenant_id, vertical, approval_flow) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE vertical = VALUES(vertical), approval_flow = VALUES(approval_flow)`,
      [tenantId, s.vertical, s.approval_flow],
    );
  },
};
