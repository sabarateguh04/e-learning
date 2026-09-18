import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool } from '../database/db';

export type AccountStatus = 'PENDING' | 'ACTIVE' | 'REJECTED';

export interface UserRow extends RowDataPacket {
  id: string;
  tenant_id: string;
  tenant_name: string;
  username: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  password_hash: string;
  role_level: number;
  account_status: AccountStatus;
  provinsi_id: number | null;
  kota_id: number | null;
  provinsi_name: string | null;
  kota_name: string | null;
  legacy_instansi_id: string | null;
  legacy_org_id: string | null;
  legacy_satker_id: string | null;
  legacy_sub_org_id: string | null;
  profile_photo_url: string | null;
  must_change_password: number;
  password_changed_at: Date | null;
  instansi_name: string | null;
  organisasi_name: string | null;
  satker_name: string | null;
  sub_org_name: string | null;
  created_at: Date;
  approved_at: Date | null;
  last_login_at: Date | null;
}

export interface CreateUserInput {
  id: string;
  tenant_id: string;
  username: string;
  employee_id: string;
  full_name: string;
  email: string | null;
  password_hash: string;
  role_level: number;
  provinsi_id: number | null;
  kota_id: number | null;
  legacy_instansi_id: string | null;
  legacy_org_id: string | null;
  legacy_satker_id: string | null;
  legacy_sub_org_id: string | null;
}

/** Joins provinsi/kota and the master hierarchy tables (all inside db_elearning). */
const SELECT = `
  SELECT u.*, t.name AS tenant_name,
         p.nama AS provinsi_name, k.nama AS kota_name,
         li.nama AS instansi_name, lo.nama AS organisasi_name, ls.nama AS satker_name, lsub.nama AS sub_org_name
    FROM tbl_elearning_users u
    JOIN tbl_elearning_tenants t ON t.id = u.tenant_id
    LEFT JOIN tbl_elearning_provinsi p ON p.id = u.provinsi_id
    LEFT JOIN tbl_elearning_kota k ON k.id = u.kota_id
    LEFT JOIN tbl_elearning_master_instansi   li   ON li.id   = u.legacy_instansi_id
    LEFT JOIN tbl_elearning_master_organisasi lo   ON lo.id   = u.legacy_org_id
    LEFT JOIN tbl_elearning_master_satker     ls   ON ls.id   = u.legacy_satker_id
    LEFT JOIN tbl_elearning_master_sub_org    lsub ON lsub.id = u.legacy_sub_org_id`;

export const userRepo = {
  /** Login lookup: username is matched case-insensitively. */
  async findByUsername(tenantId: string, username: string): Promise<UserRow | null> {
    const [rows] = await getPool().query<UserRow[]>(`${SELECT} WHERE u.tenant_id = ? AND LOWER(u.username) = LOWER(?) LIMIT 1`, [tenantId, username]);
    return rows[0] ?? null;
  },

  /** Forgot-password lookup (case-insensitive; email is optional so it may match nothing). */
  async findByEmail(tenantId: string, email: string): Promise<UserRow | null> {
    const [rows] = await getPool().query<UserRow[]>(`${SELECT} WHERE u.tenant_id = ? AND LOWER(u.email) = LOWER(?) LIMIT 1`, [tenantId, email]);
    return rows[0] ?? null;
  },

  async findByEmployeeId(tenantId: string, employeeId: string): Promise<UserRow | null> {
    const [rows] = await getPool().query<UserRow[]>(`${SELECT} WHERE u.tenant_id = ? AND u.employee_id = ? LIMIT 1`, [tenantId, employeeId]);
    return rows[0] ?? null;
  },

  async findById(id: string): Promise<UserRow | null> {
    const [rows] = await getPool().query<UserRow[]>(`${SELECT} WHERE u.id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  },

  async listByStatus(status: AccountStatus | null): Promise<UserRow[]> {
    const where = status ? 'WHERE u.account_status = ?' : '';
    const [rows] = await getPool().query<UserRow[]>(`${SELECT} ${where} ORDER BY u.created_at DESC`, status ? [status] : []);
    return rows;
  },

  async countByStatus(): Promise<Record<AccountStatus, number>> {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT account_status AS s, COUNT(*) AS n FROM tbl_elearning_users GROUP BY account_status`);
    const out: Record<AccountStatus, number> = { PENDING: 0, ACTIVE: 0, REJECTED: 0 };
    for (const r of rows) out[r.s as AccountStatus] = Number(r.n);
    return out;
  },

  async create(input: CreateUserInput): Promise<void> {
    await getPool().query(
      `INSERT INTO tbl_elearning_users
         (id, tenant_id, username, employee_id, full_name, email, password_hash, role_level, account_status, provinsi_id, kota_id,
          legacy_instansi_id, legacy_org_id, legacy_satker_id, legacy_sub_org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`,
      [
        input.id, input.tenant_id, input.username, input.employee_id, input.full_name, input.email, input.password_hash, input.role_level,
        input.provinsi_id, input.kota_id, input.legacy_instansi_id, input.legacy_org_id, input.legacy_satker_id, input.legacy_sub_org_id,
      ],
    );
  },

  async setStatus(id: string, status: AccountStatus, adminId: string): Promise<boolean> {
    const [res] = await getPool().query<ResultSetHeader>(
      `UPDATE tbl_elearning_users SET account_status = ?, approved_by = ?, approved_at = IF(? = 'ACTIVE', NOW(), approved_at) WHERE id = ?`,
      [status, adminId, status, id],
    );
    return res.affectedRows > 0;
  },

  /** Self-service profile fields (role is NOT editable here — see admin.updateUser). */
  async updateProfile(id: string, p: { full_name: string; email: string | null; provinsi_id: number | null; kota_id: number | null; legacy_instansi_id: string | null; legacy_org_id: string | null; legacy_satker_id: string | null; legacy_sub_org_id: string | null; profile_photo_url: string | null }): Promise<void> {
    await getPool().query(
      `UPDATE tbl_elearning_users
          SET full_name = ?, email = ?, provinsi_id = ?, kota_id = ?,
              legacy_instansi_id = ?, legacy_org_id = ?, legacy_satker_id = ?, legacy_sub_org_id = ?, profile_photo_url = ?
        WHERE id = ?`,
      [p.full_name, p.email, p.provinsi_id, p.kota_id, p.legacy_instansi_id, p.legacy_org_id, p.legacy_satker_id, p.legacy_sub_org_id, p.profile_photo_url, id],
    );
  },

  /** Admin reset: new hash + force a change at next login. */
  async resetPassword(id: string, passwordHash: string, mustChange: boolean): Promise<boolean> {
    const [res] = await getPool().query<ResultSetHeader>(
      `UPDATE tbl_elearning_users SET password_hash = ?, must_change_password = ?, password_changed_at = NOW() WHERE id = ?`,
      [passwordHash, mustChange ? 1 : 0, id],
    );
    return res.affectedRows > 0;
  },

  /** Self-service change: clears the forced-change flag. */
  async changePassword(id: string, passwordHash: string): Promise<void> {
    await getPool().query(`UPDATE tbl_elearning_users SET password_hash = ?, must_change_password = 0, password_changed_at = NOW() WHERE id = ?`, [passwordHash, id]);
  },

  async setPhoto(id: string, url: string | null): Promise<void> {
    await getPool().query(`UPDATE tbl_elearning_users SET profile_photo_url = ? WHERE id = ?`, [url, id]);
  },

  /** Super Admin: edit any account — role, wilayah, instansi mapping, identity. */
  async adminUpdate(
    id: string,
    p: {
      full_name: string; email: string | null; role_level: number; provinsi_id: number | null; kota_id: number | null;
      legacy_instansi_id: string | null; legacy_org_id: string | null; legacy_satker_id: string | null; legacy_sub_org_id: string | null;
    },
  ): Promise<boolean> {
    const [res] = await getPool().query<ResultSetHeader>(
      `UPDATE tbl_elearning_users
          SET full_name = ?, email = ?, role_level = ?, provinsi_id = ?, kota_id = ?,
              legacy_instansi_id = ?, legacy_org_id = ?, legacy_satker_id = ?, legacy_sub_org_id = ?
        WHERE id = ?`,
      [p.full_name, p.email, p.role_level, p.provinsi_id, p.kota_id, p.legacy_instansi_id, p.legacy_org_id, p.legacy_satker_id, p.legacy_sub_org_id, id],
    );
    return res.affectedRows > 0;
  },

  async touchLogin(id: string): Promise<void> {
    await getPool().query(`UPDATE tbl_elearning_users SET last_login_at = NOW() WHERE id = ?`, [id]);
  },
};
