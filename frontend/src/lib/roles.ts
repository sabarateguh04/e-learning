/** 6-tier RBAC — mirrors backend/src/middlewares/rbacGuard.ts. UNIT_HEAD (5) sits between EXEC_CITY and TRAINER. */
export const ROLE = {
  SUPER_ADMIN: 0,
  EXEC_NATIONAL: 1,
  EXEC_PROVINCE: 2,
  EXEC_CITY: 3,
  TRAINER: 4,
  UNIT_HEAD: 5,
} as const;

export type RoleLevel = (typeof ROLE)[keyof typeof ROLE];

export const ROLE_LABEL: Record<RoleLevel, string> = {
  0: 'Super Admin',
  1: 'Eksekutif Nasional',
  2: 'Eksekutif Provinsi',
  3: 'Eksekutif Kota',
  5: 'Pimpinan Unit',
  4: 'Trainer',
};

/** Display order (widest scope first) — the raw numbers are not ordered because 5 was added later. */
export const ROLE_ORDER: readonly RoleLevel[] = [ROLE.SUPER_ADMIN, ROLE.EXEC_NATIONAL, ROLE.EXEC_PROVINCE, ROLE.EXEC_CITY, ROLE.UNIT_HEAD, ROLE.TRAINER];

export const EXECUTIVE_ROLES: readonly RoleLevel[] = [ROLE.SUPER_ADMIN, ROLE.EXEC_NATIONAL, ROLE.EXEC_PROVINCE, ROLE.EXEC_CITY, ROLE.UNIT_HEAD];

export const isTrainer = (level?: number) => level === ROLE.TRAINER;
export const isUnitHead = (level?: number) => level === ROLE.UNIT_HEAD;
/** Roles whose account must carry a kota (city executives, unit heads, trainers). */
export const needsCity = (level?: number) => level === ROLE.EXEC_CITY || level === ROLE.UNIT_HEAD || level === ROLE.TRAINER;
/** Roles whose account must carry a satuan kerja / unit. */
export const needsUnit = (level?: number) => level === ROLE.UNIT_HEAD;
export const isExecutive = (level?: number) => level !== undefined && (EXECUTIVE_ROLES as readonly number[]).includes(level);
export const isSuperAdmin = (level?: number) => level === ROLE.SUPER_ADMIN;

/** Menu keys — mirrors backend/src/repositories/accessRepo.ts */
export const MENU_KEYS = ['dashboard', 'executive_reports', 'reports_inbox', 'modules', 'submit_report', 'my_reports', 'settings', 'access_management'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

/** Landing route after login, by role. */
export const homeFor = (level?: number) => (isSuperAdmin(level) ? '/admin/users' : isTrainer(level) ? '/modules' : '/dashboard');
