import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';
import { ROLE } from '../middlewares/rbacGuard';

/** Sidebar/feature keys the Super Admin can toggle per role. */
export const MENU_KEYS = ['dashboard', 'executive_reports', 'reports_inbox', 'modules', 'submit_report', 'my_reports', 'settings', 'access_management'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

export const MENU_META: Record<MenuKey, { label: string; description: string; locked?: number[] }> = {
  dashboard: { label: 'Dashboard Eksekutif', description: 'Ringkasan analitik terskop: sesi, trainer teratas, modul teratas' },
  executive_reports: { label: 'Laporan', description: 'Laporan eksekutif per wilayah: analitik modul, top trainer, aktivitas & progres, ekspor PDF' },
  reports_inbox: { label: 'Report Inbox', description: 'Review field reports within scope' },
  modules: { label: 'Learning Modules', description: 'Browse and watch approved modules' },
  submit_report: { label: 'Lap Kegiatan', description: 'Laporan kegiatan lapangan ber-GPS dengan tanggal, audiens, dan 2-4 foto bukti' },
  my_reports: { label: 'Laporan Saya', description: 'Riwayat lap kegiatan milik sendiri' },
  settings: { label: 'Tenant Settings', description: 'Branding, territories, provisioning' },
  access_management: { label: 'Access Management', description: 'Approvals & RBAC matrix', locked: [ROLE.SUPER_ADMIN] },
};

export type MenuMatrix = Record<MenuKey, Record<number, boolean>>;

export const accessRepo = {
  async getMatrix(): Promise<MenuMatrix> {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT menu_key, role_level, allowed FROM tbl_elearning_menu_access`);
    const matrix = Object.fromEntries(MENU_KEYS.map((k) => [k, Object.fromEntries(Object.values(ROLE).map((lvl) => [lvl, false]))])) as MenuMatrix;
    for (const r of rows) {
      if (r.menu_key in matrix) matrix[r.menu_key as MenuKey][Number(r.role_level)] = Boolean(r.allowed);
    }
    // Super Admin can never lock itself out of access management.
    matrix.access_management[ROLE.SUPER_ADMIN] = true;
    return matrix;
  },

  async allowedMenusFor(roleLevel: number): Promise<MenuKey[]> {
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT menu_key FROM tbl_elearning_menu_access WHERE role_level = ? AND allowed = 1`, [roleLevel]);
    const keys = new Set(rows.map((r) => r.menu_key as MenuKey));
    if (roleLevel === ROLE.SUPER_ADMIN) keys.add('access_management');
    return MENU_KEYS.filter((k) => keys.has(k));
  },

  async isAllowed(menuKey: MenuKey, roleLevel: number): Promise<boolean> {
    if (menuKey === 'access_management' && roleLevel === ROLE.SUPER_ADMIN) return true;
    const [rows] = await getPool().query<RowDataPacket[]>(`SELECT allowed FROM tbl_elearning_menu_access WHERE menu_key = ? AND role_level = ? LIMIT 1`, [menuKey, roleLevel]);
    return rows[0] ? Boolean(rows[0].allowed) : false;
  },

  /** Upserts the full matrix in one statement. */
  async setMatrix(matrix: Partial<Record<MenuKey, Record<number, boolean>>>, adminId: string): Promise<void> {
    const rows: unknown[][] = [];
    for (const key of MENU_KEYS) {
      const perRole = matrix[key];
      if (!perRole) continue;
      for (const lvl of Object.values(ROLE)) {
        if (perRole[lvl] === undefined) continue;
        const locked = MENU_META[key].locked?.includes(lvl);
        rows.push([key, lvl, locked ? 1 : perRole[lvl] ? 1 : 0, adminId]);
      }
    }
    if (!rows.length) return;
    await getPool().query(
      `INSERT INTO tbl_elearning_menu_access (menu_key, role_level, allowed, updated_by) VALUES ?
       ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_by = VALUES(updated_by)`,
      [rows],
    );
  },
};
