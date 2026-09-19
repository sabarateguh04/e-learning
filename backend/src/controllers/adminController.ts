import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { ROLE, ROLE_LABEL } from '../middlewares/rbacGuard';
import { userRepo, AccountStatus } from '../repositories/userRepo';
import { moduleRepo, ApprovalStatus } from '../repositories/moduleRepo';
import { tenantRepo } from '../repositories/tenantRepo';
import { accessRepo, MENU_KEYS, MENU_META, MenuKey } from '../repositories/accessRepo';
import { regionRepo } from '../repositories/regionRepo';
import { masterDataRepo } from '../repositories/masterDataRepo';
import { isRoleLevel } from '../middlewares/rbacGuard';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

/** Unambiguous alphabet (no 0/O, 1/l/I) for temporary passwords read aloud or copied. */
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const generateTempPassword = (length = 12) =>
  Array.from({ length }, () => TEMP_ALPHABET[randomInt(0, TEMP_ALPHABET.length)]).join('');

type Handler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
const wrap = (fn: Handler): Handler => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};

const presentUser = (u: Awaited<ReturnType<typeof userRepo.findById>>) =>
  u && {
    id: u.id,
    tenant_id: u.tenant_id,
    tenant_name: u.tenant_name,
    username: u.username,
    employee_id: u.employee_id,
    full_name: u.full_name,
    email: u.email,
    role_level: u.role_level,
    role_label: ROLE_LABEL[u.role_level as keyof typeof ROLE_LABEL] ?? 'Unknown',
    account_status: u.account_status,
    must_change_password: Boolean(u.must_change_password),
    password_changed_at: u.password_changed_at ? new Date(u.password_changed_at).toISOString() : null,
    provinsi_name: u.provinsi_name,
    kota_name: u.kota_name,
    profile_photo_url: u.profile_photo_url,
    provinsi_id: u.provinsi_id,
    kota_id: u.kota_id,
    legacy_ids: { instansi: u.legacy_instansi_id, organisasi: u.legacy_org_id, satker: u.legacy_satker_id, sub_org: u.legacy_sub_org_id },
    legacy: { instansi: u.instansi_name, organisasi: u.organisasi_name, satker: u.satker_name, sub_org: u.sub_org_name },
    created_at: new Date(u.created_at).toISOString(),
    approved_at: u.approved_at ? new Date(u.approved_at).toISOString() : null,
  };

// GET /api/admin/overview
export const getOverview = wrap(async (_req, res) => {
  const [users, modules, tenants] = await Promise.all([userRepo.countByStatus(), moduleRepo.countByStatus(), tenantRepo.list()]);
  res.json({ success: true, users, modules, tenants: tenants.length });
});

// ── Account approval ──────────────────────────────────────────────────────────

// GET /api/admin/users?status=PENDING
export const listUsers = wrap(async (req, res) => {
  const status = typeof req.query.status === 'string' ? (req.query.status.toUpperCase() as AccountStatus) : null;
  const rows = await userRepo.listByStatus(status && ['PENDING', 'ACTIVE', 'REJECTED'].includes(status) ? status : null);
  res.json({ success: true, total: rows.length, data: rows.map(presentUser) });
});

const setUserStatus = (status: AccountStatus): Handler =>
  wrap(async (req, res) => {
    const id = req.params.id as string;
    const target = await userRepo.findById(id);
    if (!target) {
      res.status(404).json({ error: 'Not Found', message: 'User not found' });
      return;
    }
    if (target.role_level === ROLE.SUPER_ADMIN) {
      res.status(403).json({ error: 'Forbidden', message: 'Super Admin accounts cannot be changed here' });
      return;
    }
    await userRepo.setStatus(id, status, req.user!.id);
    res.json({ success: true, message: `Account ${status === 'ACTIVE' ? 'approved' : 'rejected'}`, data: presentUser(await userRepo.findById(id)) });
  });

// PUT|PATCH /api/admin/users/:id
// body: { full_name?, email?, role_level?, provinsi_id?, kota_id?, legacy_instansi_id?, legacy_org_id?, legacy_satker_id?, legacy_sub_org_id? }
// Omitted fields keep their current value; explicit null/'' clears an optional field.
export const updateUser = wrap(async (req, res) => {
  const id = req.params.id as string;
  const target = await userRepo.findById(id);
  if (!target) {
    res.status(404).json({ error: 'Not Found', message: 'User not found' });
    return;
  }
  const b = req.body ?? {};
  const pick = <T,>(key: string, current: T, parse: (v: unknown) => T): T => (b[key] === undefined ? current : parse(b[key]));
  const optStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const optNum = (v: unknown) => (v === null || v === '' || v === undefined ? null : Number(v));

  const full_name = pick('full_name', target.full_name, (v) => String(v ?? '').trim());
  const email = pick('email', target.email, optStr);
  const role_level = pick('role_level', target.role_level, (v) => Number(v));
  const provinsi_id = pick('provinsi_id', target.provinsi_id, optNum);
  const kota_id = pick('kota_id', target.kota_id, optNum);
  // Any chain field present => full chain submission; omitted deeper levels are cleared, not inherited.
  const chainTouched = ['legacy_instansi_id', 'legacy_org_id', 'legacy_satker_id', 'legacy_sub_org_id'].some((k) => k in b);
  const chainField = (key: string, current: string | null) => (chainTouched ? optStr(b[key]) : current);
  const legacy_instansi_id = chainField('legacy_instansi_id', target.legacy_instansi_id);
  const legacy_org_id = chainField('legacy_org_id', target.legacy_org_id);
  const legacy_satker_id = chainField('legacy_satker_id', target.legacy_satker_id);
  const legacy_sub_org_id = chainField('legacy_sub_org_id', target.legacy_sub_org_id);

  const errors: Record<string, string> = {};
  if (full_name.length < 3) errors.full_name = 'Full name must be at least 3 characters';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email address';
  if (!isRoleLevel(role_level)) errors.role_level = 'Invalid role level';
  if (target.id === req.user!.id && role_level !== ROLE.SUPER_ADMIN) errors.role_level = 'You cannot demote your own account';
  if (role_level === ROLE.EXEC_PROVINCE && !provinsi_id) errors.provinsi_id = 'Province executives need a province';
  if ((role_level === ROLE.EXEC_CITY || role_level === ROLE.UNIT_HEAD || role_level === ROLE.TRAINER) && !kota_id) errors.kota_id = 'City executives, unit heads and trainers need a city';
  if (role_level === ROLE.UNIT_HEAD && !legacy_satker_id) errors.legacy_satker_id = 'Unit heads need a satuan kerja / unit';
  if (kota_id && !provinsi_id) errors.provinsi_id = 'Choose the province of the selected city';
  if (kota_id && provinsi_id && !(await regionRepo.kotaBelongsToProvinsi(kota_id, provinsi_id))) errors.kota_id = 'City does not belong to the selected province';
  if (!legacy_instansi_id) errors.legacy_instansi_id = 'Instansi is required';
  Object.assign(errors, await masterDataRepo.validateChain({ instansi: legacy_instansi_id, organisasi: legacy_org_id, satker: legacy_satker_id, sub_org: legacy_sub_org_id }));

  if (Object.keys(errors).length) {
    res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors });
    return;
  }
  await userRepo.adminUpdate(id, { full_name, email, role_level, provinsi_id, kota_id, legacy_instansi_id, legacy_org_id, legacy_satker_id, legacy_sub_org_id });
  res.json({ success: true, message: 'User updated', data: presentUser(await userRepo.findById(id)) });
});

// POST /api/admin/users/:id/reset-password   { new_password?, must_change_password? = true }
// Empty new_password -> a temporary password is generated and returned ONCE in the response.
export const resetPassword = wrap(async (req, res) => {
  const id = req.params.id as string;
  const target = await userRepo.findById(id);
  if (!target) {
    res.status(404).json({ error: 'Not Found', message: 'User not found' });
    return;
  }
  if (target.id === req.user!.id) {
    res.status(403).json({ error: 'Forbidden', message: 'Change your own password from your profile' });
    return;
  }
  if (target.role_level === ROLE.SUPER_ADMIN) {
    res.status(403).json({ error: 'Forbidden', message: 'Super Admin accounts cannot be reset here' });
    return;
  }

  const b = req.body ?? {};
  const provided = typeof b.new_password === 'string' ? b.new_password : '';
  const mustChange = b.must_change_password === undefined ? true : Boolean(b.must_change_password);
  if (provided && provided.length < 8) {
    res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors: { new_password: 'Password must be at least 8 characters' } });
    return;
  }

  const generated = !provided;
  const password = generated ? generateTempPassword() : provided;
  await userRepo.resetPassword(id, await bcrypt.hash(password, 10), mustChange);

  res.json({
    success: true,
    message: generated ? 'Temporary password generated' : 'Password reset',
    generated,
    must_change_password: mustChange,
    // Shown once to the admin; never persisted in clear text.
    ...(generated ? { temporary_password: password } : {}),
    data: presentUser(await userRepo.findById(id)),
  });
});

// PATCH /api/admin/users/:id/approve   -> account_status = ACTIVE
export const approveUser = setUserStatus('ACTIVE');
// PATCH /api/admin/users/:id/reject
export const rejectUser = setUserStatus('REJECTED');

// ── Module approval ───────────────────────────────────────────────────────────

// GET /api/admin/modules?status=PENDING
export const listModules = wrap(async (req, res) => {
  const status = typeof req.query.status === 'string' ? (req.query.status.toUpperCase() as ApprovalStatus) : null;
  const rows = await moduleRepo.listForAdmin(status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status : null);
  res.json({ success: true, total: rows.length, data: rows });
});

const setModuleApproval = (status: ApprovalStatus): Handler =>
  wrap(async (req, res) => {
    const id = req.params.id as string;
    if (!(await moduleRepo.setApproval(id, status, req.user!.id))) {
      res.status(404).json({ error: 'Not Found', message: 'Module not found' });
      return;
    }
    res.json({ success: true, message: `Module ${status === 'APPROVED' ? 'approved' : 'rejected'}`, data: await moduleRepo.findById(id) });
  });

// PATCH /api/admin/modules/:id/approve   -> approval_status = APPROVED
export const approveModule = setModuleApproval('APPROVED');
// PATCH /api/admin/modules/:id/reject
export const rejectModule = setModuleApproval('REJECTED');

// ── Menu access (RBAC matrix) ─────────────────────────────────────────────────

// GET /api/admin/menu-access
export const getMenuAccess = wrap(async (_req, res) => {
  res.json({
    success: true,
    roles: Object.values(ROLE).map((level) => ({ level, label: ROLE_LABEL[level] })),
    menus: MENU_KEYS.map((key) => ({ key, ...MENU_META[key] })),
    matrix: await accessRepo.getMatrix(),
  });
});

// PUT /api/admin/menu-access   body: { matrix: { [menu_key]: { [role_level]: boolean } } }
export const updateMenuAccess = wrap(async (req, res) => {
  const matrix = req.body?.matrix;
  if (!matrix || typeof matrix !== 'object') {
    res.status(400).json({ error: 'Bad Request', message: 'Body must contain a "matrix" object' });
    return;
  }
  const clean: Partial<Record<MenuKey, Record<number, boolean>>> = {};
  for (const key of MENU_KEYS) {
    const perRole = matrix[key];
    if (!perRole || typeof perRole !== 'object') continue;
    clean[key] = Object.fromEntries(Object.values(ROLE).filter((lvl) => lvl in perRole).map((lvl) => [lvl, Boolean(perRole[lvl])]));
  }
  await accessRepo.setMatrix(clean, req.user!.id);
  res.json({ success: true, message: 'Menu access updated', matrix: await accessRepo.getMatrix() });
});
