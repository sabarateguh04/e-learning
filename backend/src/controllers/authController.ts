import { BRAND } from '../config';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AuthenticatedRequest, JWT_SECRET, UserPayload } from '../middlewares/authenticate';
import { ROLE, ROLE_LABEL, REGISTERABLE_ROLES, isRoleLevel } from '../middlewares/rbacGuard';
import { userRepo, UserRow } from '../repositories/userRepo';
import { tenantRepo, TenantRow } from '../repositories/tenantRepo';
import { labelsFor, roleLabelFor } from '../services/vocabulary';
import { regionRepo } from '../repositories/regionRepo';
import { accessRepo } from '../repositories/accessRepo';
import { masterDataRepo } from '../repositories/masterDataRepo';
import { captchaEnabled, issueCaptcha, verifyCaptcha } from '../services/captcha';
import { ADMIN_CONTACT_EMAIL, ADMIN_CONTACT_PHONE, sendMail } from '../services/mailer';
import { randomInt } from 'node:crypto';

const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const generateTempPassword = (length = 12) => Array.from({ length }, () => TEMP_ALPHABET[randomInt(0, TEMP_ALPHABET.length)]).join('');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Throttle forgot-password to one request per e-mail per minute (in-memory). */
const forgotThrottle = new Map<string, number>();
const FORGOT_WINDOW_MS = 60 * 1000;

const captchaError = (result: ReturnType<typeof verifyCaptcha>) =>
  result === 'wrong' ? 'Captcha answer is incorrect' : result === 'expired' ? 'Captcha has expired, please try again' : 'Captcha is required';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Avatar storage: <backend>/uploads/avatars, served statically at /uploads. */
export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const isHttpUrl = (v: string) => /^https?:\/\/\S+$/i.test(v);
const isLocalUpload = (v: string) => /^\/uploads\/avatars\/[\w.-]+$/.test(v);
import { describeScope } from '../services/scope';

const TOKEN_TTL = (process.env.JWT_EXPIRES_IN || '24h') as jwt.SignOptions['expiresIn'];
const DEFAULT_TENANT = 'dummy-uuid';

/** Tenant hint: explicit header first, then request subdomain (acme.example.com -> "acme"). */
/**
 * Tenant for unauthenticated calls: explicit x-tenant-id header, else the first label of a
 * real sub-domain (korlantas.example.go.id -> "korlantas"). Bare hosts, localhost and IP
 * addresses (172.20.4.220 would otherwise split into "172") fall back to the default tenant.
 */
const resolveTenantHint = (req: Request): string => {
  const header = req.headers['x-tenant-id'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const host = req.hostname.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  const parts = host.split('.');
  return !isIp && parts.length > 2 ? parts[0] : DEFAULT_TENANT;
};

/** Looks the hint up; when nothing matches and the client sent no explicit header, use the default tenant. */
const resolveTenant = async (req: Request) => {
  const hint = resolveTenantHint(req);
  const found = await tenantRepo.findByIdOrSubdomain(hint);
  if (found || typeof req.headers['x-tenant-id'] === 'string') return found;
  return tenantRepo.findByIdOrSubdomain(DEFAULT_TENANT);
};

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/; // 3-32 chars, lower-case letters, digits, . _ -

/** Tenant as the frontend sees it: identity + behaviour (vertical vocabulary, approval flow). */
export const presentTenant = (t: TenantRow) => ({
  id: t.id,
  name: t.name,
  subdomain: t.subdomain,
  instansi_name: t.instansi_name,
  theme_color: t.theme_color,
  vertical: t.vertical,
  approval_flow: t.approval_flow,
  labels: labelsFor(t.vertical),
});

const buildPayload = (u: UserRow): UserPayload => ({
  id: u.id,
  tenant_id: u.tenant_id,
  username: u.username,
  employee_id: u.employee_id,
  full_name: u.full_name,
  role_level: u.role_level,
  provinsi_id: u.provinsi_id,
  kota_id: u.kota_id,
  provinsi_name: u.provinsi_name,
  kota_name: u.kota_name,
  instansi_id: u.legacy_instansi_id ?? null,
  instansi_name: u.instansi_name ?? null,
  satker_id: u.legacy_satker_id ?? null,
  satker_name: u.satker_name ?? null,
  territory_level: u.kota_id ? 'CITY' : u.provinsi_id ? 'PROVINCE' : 'NATIONAL',
  territory_name: u.kota_name ?? u.provinsi_name ?? 'National',
  ...(u.must_change_password ? { must_change_password: true } : {}),
});

const presentUser = async (payload: UserPayload, row?: UserRow | null, tenant?: TenantRow | null) => ({
  ...payload,
  role_label: roleLabelFor(tenant?.vertical, payload.role_level, isRoleLevel(payload.role_level) ? ROLE_LABEL[payload.role_level] : 'Unknown'),
  scope: describeScope(payload),
  menus: await accessRepo.allowedMenusFor(payload.role_level),
  profile_photo_url: row?.profile_photo_url ?? null,
  must_change_password: Boolean(payload.must_change_password),
  legacy: row
    ? {
        instansi: row.instansi_name,
        organisasi: row.organisasi_name,
        satker: row.satker_name,
        sub_org: row.sub_org_name,
      }
    : null,
});

// GET /api/auth/captcha  -> { id, question }  (single-use, 5 minutes)
export const getCaptcha = (_req: Request, res: Response): void => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, enabled: captchaEnabled(), captcha: captchaEnabled() ? issueCaptcha() : null });
};

// POST /api/auth/login   { username, password, captcha_id, captcha_answer }
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { username, password, captcha_id, captcha_answer } = req.body ?? {};
    if (typeof username !== 'string' || !username.trim() || !password) {
      res.status(400).json({ error: 'Bad Request', message: 'Username and password are required' });
      return;
    }

    const captcha = verifyCaptcha(captcha_id, captcha_answer);
    if (captcha !== 'ok') {
      res.status(400).json({ error: 'Bad Request', code: 'CAPTCHA_INVALID', message: captchaError(captcha) });
      return;
    }

    const tenant = await resolveTenant(req);
    if (!tenant) {
      res.status(404).json({ error: 'Not Found', message: 'Tenant not found' });
      return;
    }

    const user = await userRepo.findByUsername(tenant.id, username.trim());
    if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid username or password' });
      return;
    }

    // Registration must be approved by a Super Admin before the account can sign in.
    if (user.account_status !== 'ACTIVE') {
      const pending = user.account_status === 'PENDING';
      res.status(403).json({
        error: 'Forbidden',
        code: pending ? 'ACCOUNT_PENDING' : 'ACCOUNT_REJECTED',
        message: pending
          ? 'Your registration is awaiting approval from the administrator.'
          : 'Your registration was rejected. Contact your administrator.',
      });
      return;
    }

    const payload = buildPayload(user);
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
    await userRepo.touchLogin(user.id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: await presentUser(payload, user, tenant),
      tenant: presentTenant(tenant),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/tenants  (public: workspace picker on the login page)
export const listTenants = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const tenants = await tenantRepo.list();
    res.json({ success: true, data: tenants.map((t) => ({ id: t.id, name: t.name, subdomain: t.subdomain, instansi_name: t.instansi_name, vertical: t.vertical })) });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/register-options  (public: dropdown data for the registration form)
export const registerOptions = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [provinsi, kota, legacy, tenants] = await Promise.all([regionRepo.provinsi(), regionRepo.kota(), regionRepo.legacyMasters(), tenantRepo.list()]);
    res.json({
      success: true,
      roles: REGISTERABLE_ROLES.map((level) => ({ level, label: ROLE_LABEL[level] })),
      tenants: tenants.map((t) => ({ id: t.id, name: t.name, instansi_name: t.instansi_name, vertical: t.vertical })),
      provinsi,
      kota,
      legacy,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/register  -> account_status = PENDING until a Super Admin approves
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const b = req.body ?? {};
    const errors: Record<string, string> = {};

    const username = typeof b.username === 'string' ? b.username.trim().toLowerCase() : '';
    const employee_id = typeof b.employee_id === 'string' ? b.employee_id.trim() : '';
    const full_name = typeof b.full_name === 'string' ? b.full_name.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const email = typeof b.email === 'string' && b.email.trim() ? b.email.trim() : null;
    const role_level = Number(b.role_level ?? ROLE.TRAINER);
    const tenant_id = typeof b.tenant_id === 'string' && b.tenant_id ? b.tenant_id : resolveTenantHint(req);
    const provinsi_id = b.provinsi_id ? Number(b.provinsi_id) : null;
    const kota_id = b.kota_id ? Number(b.kota_id) : null;
    const legacyField = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const legacy_instansi_id = legacyField(b.legacy_instansi_id);
    const legacy_org_id = legacyField(b.legacy_org_id);
    const legacy_satker_id = legacyField(b.legacy_satker_id);
    const legacy_sub_org_id = legacyField(b.legacy_sub_org_id);

    const captcha = verifyCaptcha(b.captcha_id, b.captcha_answer);
    if (captcha !== 'ok') errors.captcha_answer = captchaError(captcha);

    if (!USERNAME_RE.test(username)) errors.username = 'Username must be 3-32 characters: letters, digits, dot, underscore or hyphen';
    if (!employee_id) errors.employee_id = 'NIP / Employee ID is required';
    if (!full_name) errors.full_name = 'Full name is required';
    if (password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (!isRoleLevel(role_level) || role_level === ROLE.SUPER_ADMIN) errors.role_level = 'Choose a valid role (Super Admin cannot self-register)';
    if (role_level === ROLE.EXEC_PROVINCE && !provinsi_id) errors.provinsi_id = 'Province executives must choose a province';
    if ((role_level === ROLE.EXEC_CITY || role_level === ROLE.UNIT_HEAD || role_level === ROLE.TRAINER) && !kota_id) errors.kota_id = 'Choose your city';
    if (role_level === ROLE.UNIT_HEAD && !legacy_satker_id) errors.legacy_satker_id = 'Pimpinan Unit harus memilih satuan kerja / unit yang dipimpin';
    if (kota_id && provinsi_id && !(await regionRepo.kotaBelongsToProvinsi(kota_id, provinsi_id))) errors.kota_id = 'City does not belong to the selected province';
    if (!legacy_instansi_id) errors.legacy_instansi_id = 'Instansi is required';

    const tenant = (await tenantRepo.findByIdOrSubdomain(tenant_id)) ?? (typeof b.tenant_id === 'string' && b.tenant_id ? null : await resolveTenant(req));
    if (!tenant) errors.tenant_id = 'Tenant not found';

    // Hierarchy check: instansi -> organisasi -> satker -> sub_org must be consistent
    Object.assign(errors, await masterDataRepo.validateChain({ instansi: legacy_instansi_id, organisasi: legacy_org_id, satker: legacy_satker_id, sub_org: legacy_sub_org_id }));

    if (tenant && username && (await userRepo.findByUsername(tenant.id, username))) errors.username = 'Username is already taken';
    if (tenant && employee_id && (await userRepo.findByEmployeeId(tenant.id, employee_id))) errors.employee_id = 'NIP / Employee ID is already registered';

    if (Object.keys(errors).length) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors });
      return;
    }

    const id = randomUUID();
    await userRepo.create({
      id,
      tenant_id: tenant!.id,
      username,
      employee_id,
      full_name,
      email,
      password_hash: await bcrypt.hash(password, 10),
      role_level,
      provinsi_id,
      kota_id,
      legacy_instansi_id,
      legacy_org_id,
      legacy_satker_id,
      legacy_sub_org_id,
    });

    res.status(201).json({
      success: true,
      message: 'Registration received. Your account is pending approval by the administrator.',
      data: { id, username, employee_id, full_name, role_level, account_status: 'PENDING' },
    });
  } catch (err) {
    next(err);
  }
};

const presentProfile = (row: UserRow) => ({
  id: row.id,
  username: row.username,
  employee_id: row.employee_id,
  full_name: row.full_name,
  email: row.email,
  role_level: row.role_level,
  role_label: isRoleLevel(row.role_level) ? ROLE_LABEL[row.role_level] : 'Unknown',
  account_status: row.account_status,
  profile_photo_url: row.profile_photo_url,
  tenant: { id: row.tenant_id, name: row.tenant_name },
  wilayah: {
    provinsi_id: row.provinsi_id,
    provinsi_name: row.provinsi_name,
    kota_id: row.kota_id,
    kota_name: row.kota_name,
    level: row.kota_id ? 'CITY' : row.provinsi_id ? 'PROVINCE' : 'NATIONAL',
  },
  instansi: {
    legacy_instansi_id: row.legacy_instansi_id,
    legacy_org_id: row.legacy_org_id,
    legacy_satker_id: row.legacy_satker_id,
    legacy_sub_org_id: row.legacy_sub_org_id,
    instansi_name: row.instansi_name,
    organisasi_name: row.organisasi_name,
    satker_name: row.satker_name,
    sub_org_name: row.sub_org_name,
  },
  created_at: new Date(row.created_at).toISOString(),
  approved_at: row.approved_at ? new Date(row.approved_at).toISOString() : null,
  last_login_at: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
});

// GET /api/auth/profile
export const getProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const row = await userRepo.findById(req.user!.id);
    if (!row) {
      res.status(404).json({ error: 'Not Found', message: 'Profile not found' });
      return;
    }
    res.json({ success: true, data: presentProfile(row) });
  } catch (err) {
    next(err);
  }
};

// PUT /api/auth/profile  — name, email, wilayah, instansi mapping.
// role_level is intentionally NOT self-editable (privilege escalation); Super Admin changes it via /api/admin/users/:id.
export const updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const current = await userRepo.findById(req.user!.id);
    if (!current) {
      res.status(404).json({ error: 'Not Found', message: 'Profile not found' });
      return;
    }
    const b = req.body ?? {};
    const errors: Record<string, string> = {};
    const full_name = typeof b.full_name === 'string' ? b.full_name.trim() : current.full_name;
    const email = typeof b.email === 'string' ? b.email.trim() || null : current.email;
    const provinsi_id = b.provinsi_id === undefined ? current.provinsi_id : b.provinsi_id ? Number(b.provinsi_id) : null;
    const kota_id = b.kota_id === undefined ? current.kota_id : b.kota_id ? Number(b.kota_id) : null;
    // Chain semantics: if the request touches ANY level of the instansi chain it is treated as a full
    // chain submission - levels left out are cleared (never silently kept from the old chain).
    const CHAIN_KEYS = ['legacy_instansi_id', 'legacy_org_id', 'legacy_satker_id', 'legacy_sub_org_id'] as const;
    const chainTouched = CHAIN_KEYS.some((k) => k in b);
    const legacyField = (key: (typeof CHAIN_KEYS)[number], fallback: string | null) =>
      chainTouched ? (typeof b[key] === 'string' && b[key].trim() ? String(b[key]).trim() : null) : fallback;
    const legacy_instansi_id = legacyField('legacy_instansi_id', current.legacy_instansi_id);
    const legacy_org_id = legacyField('legacy_org_id', current.legacy_org_id);
    const legacy_satker_id = legacyField('legacy_satker_id', current.legacy_satker_id);
    const legacy_sub_org_id = legacyField('legacy_sub_org_id', current.legacy_sub_org_id);
    const profile_photo_url = b.profile_photo_url === undefined ? current.profile_photo_url : typeof b.profile_photo_url === 'string' && b.profile_photo_url.trim() ? b.profile_photo_url.trim() : null;

    if (full_name.length < 3) errors.full_name = 'Full name must be at least 3 characters';
    if (profile_photo_url && profile_photo_url.length > 500) errors.profile_photo_url = 'Photo URL is too long (max 500 characters)';
    else if (profile_photo_url && !isHttpUrl(profile_photo_url) && !isLocalUpload(profile_photo_url)) errors.profile_photo_url = 'Photo must be an http(s) URL or an uploaded file';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email address';
    if (b.role_level !== undefined && Number(b.role_level) !== current.role_level) errors.role_level = 'Role can only be changed by a Super Admin';
    if (current.role_level === ROLE.EXEC_PROVINCE && !provinsi_id) errors.provinsi_id = 'Province executives must have a province';
    if ((current.role_level === ROLE.EXEC_CITY || current.role_level === ROLE.UNIT_HEAD || current.role_level === ROLE.TRAINER) && !kota_id) errors.kota_id = 'Choose your city';
    if (current.role_level === ROLE.UNIT_HEAD && !legacy_satker_id) errors.legacy_satker_id = 'Pimpinan Unit harus memiliki satuan kerja / unit';
    if (kota_id && !provinsi_id) errors.provinsi_id = 'Choose the province of the selected city';
    if (kota_id && provinsi_id && !(await regionRepo.kotaBelongsToProvinsi(kota_id, provinsi_id))) errors.kota_id = 'City does not belong to the selected province';
    // Hierarchy check runs only when the request touches the instansi mapping, so unrelated edits
    // (photo, email) are not blocked by a pre-existing inconsistent chain.
    if (chainTouched) {
      if (!legacy_instansi_id) errors.legacy_instansi_id = 'Instansi is required';
      Object.assign(errors, await masterDataRepo.validateChain({ instansi: legacy_instansi_id, organisasi: legacy_org_id, satker: legacy_satker_id, sub_org: legacy_sub_org_id }));
    }

    if (Object.keys(errors).length) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors });
      return;
    }

    await userRepo.updateProfile(current.id, { full_name, email, provinsi_id, kota_id, legacy_instansi_id, legacy_org_id, legacy_satker_id, legacy_sub_org_id, profile_photo_url });
    const row = (await userRepo.findById(current.id))!;
    // Territory changes affect scoping claims -> issue a fresh token.
    const payload = buildPayload(row);
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
    res.json({ success: true, message: 'Profile updated', data: presentProfile(row), token, user: await presentUser(payload, row, await tenantRepo.findById(row.tenant_id)) });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/support  -> administrator contact shown on the forgot-password screen
export const getSupportContact = (_req: Request, res: Response): void => {
  res.json({ success: true, contact: { email: ADMIN_CONTACT_EMAIL, phone: ADMIN_CONTACT_PHONE || null } });
};

// POST /api/auth/forgot-password   { email, captcha_id, captcha_answer }
// Registered e-mail -> temporary password (bcrypt), must_change_password = 1, message sent (simulated).
// Unknown e-mail  -> 404 with the administrator contact for manual help.
export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const b = req.body ?? {};
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const errors: Record<string, string> = {};
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid e-mail address';
    const captcha = verifyCaptcha(b.captcha_id, b.captcha_answer);
    if (captcha !== 'ok') errors.captcha_answer = captchaError(captcha);
    if (Object.keys(errors).length) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors });
      return;
    }

    const last = forgotThrottle.get(email) ?? 0;
    if (Date.now() - last < FORGOT_WINDOW_MS) {
      res.status(429).json({ error: 'Too Many Requests', code: 'FORGOT_THROTTLED', message: 'A reset was requested less than a minute ago. Please wait before trying again.' });
      return;
    }

    const tenant = await resolveTenant(req);
    const user = tenant ? await userRepo.findByEmail(tenant.id, email) : null;
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        code: 'EMAIL_NOT_REGISTERED',
        message: 'This e-mail address is not registered on the platform.',
        contact: { email: ADMIN_CONTACT_EMAIL, phone: ADMIN_CONTACT_PHONE || null },
      });
      return;
    }
    if (user.account_status !== 'ACTIVE') {
      res.status(403).json({
        error: 'Forbidden',
        code: user.account_status === 'PENDING' ? 'ACCOUNT_PENDING' : 'ACCOUNT_REJECTED',
        message: 'This account is not active yet. Contact the administrator.',
        contact: { email: ADMIN_CONTACT_EMAIL, phone: ADMIN_CONTACT_PHONE || null },
      });
      return;
    }

    forgotThrottle.set(email, Date.now());
    const temporary = generateTempPassword();
    await userRepo.resetPassword(user.id, await bcrypt.hash(temporary, 10), true);
    const { delivery } = await sendMail({
      to: email,
      subject: `Password sementara akun ${BRAND.app} Anda`,
      text: `Halo ${user.full_name},\n\nPassword sementara untuk username "${user.username}" adalah: ${temporary}\n\nMasuk dengan password ini, lalu Anda akan diminta membuat password baru.\nJika Anda tidak meminta reset ini, hubungi ${ADMIN_CONTACT_EMAIL}.`,
    });

    res.json({
      success: true,
      message: 'A temporary password has been sent to your e-mail. You will be asked to set a new password at your next login.',
      delivery,
      masked_email: email.replace(/^(.{2}).*(@.*)$/, '$1***$2'),
      // Simulated delivery only (no SMTP): surface the temporary password so local testing is possible.
      ...(delivery === 'simulated' ? { temporary_password: temporary } : {}),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-password   { current_password, new_password }
// Also the only way out of a forced change (must_change_password) — re-issues a token without the flag.
export const changePassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { current_password, new_password } = req.body ?? {};
    const errors: Record<string, string> = {};
    if (typeof current_password !== 'string' || !current_password) errors.current_password = 'Current password is required';
    if (typeof new_password !== 'string' || new_password.length < 8) errors.new_password = 'New password must be at least 8 characters';
    else if (new_password === current_password) errors.new_password = 'New password must differ from the current one';
    if (Object.keys(errors).length) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors });
      return;
    }
    const row = await userRepo.findById(req.user!.id);
    if (!row || !(await bcrypt.compare(current_password, row.password_hash))) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors: { current_password: 'Current password is incorrect' } });
      return;
    }
    await userRepo.changePassword(row.id, await bcrypt.hash(new_password, 10));
    const fresh = (await userRepo.findById(row.id))!;
    const payload = buildPayload(fresh);
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
    res.json({ success: true, message: 'Password updated', token, user: await presentUser(payload, fresh, await tenantRepo.findById(fresh.tenant_id)) });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/profile/photo   body: { image: "data:image/png;base64,..." }  -> stores the file, returns its URL
export const uploadProfilePhoto = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const image = typeof req.body?.image === 'string' ? req.body.image : '';
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!match) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors: { image: 'Send a PNG, JPEG or WebP image as a base64 data URL' } });
      return;
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > AVATAR_MAX_BYTES) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors: { image: 'Image must be 2 MB or smaller' } });
      return;
    }
    const current = await userRepo.findById(req.user!.id);
    if (!current) {
      res.status(404).json({ error: 'Not Found', message: 'Profile not found' });
      return;
    }
    await mkdir(AVATAR_DIR, { recursive: true });
    const file = `${current.id}-${Date.now()}.${AVATAR_TYPES[match[1]]}`;
    await writeFile(path.join(AVATAR_DIR, file), buffer);
    const url = `/uploads/avatars/${file}`;
    await userRepo.setPhoto(current.id, url);
    // Best-effort cleanup of the previous local upload.
    if (current.profile_photo_url && isLocalUpload(current.profile_photo_url)) {
      await unlink(path.join(UPLOAD_ROOT, current.profile_photo_url.replace(/^\/uploads\//, ''))).catch(() => undefined);
    }
    res.status(201).json({ success: true, message: 'Profile photo updated', profile_photo_url: url });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/auth/profile/photo
export const removeProfilePhoto = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const current = await userRepo.findById(req.user!.id);
    if (current?.profile_photo_url && isLocalUpload(current.profile_photo_url)) {
      await unlink(path.join(UPLOAD_ROOT, current.profile_photo_url.replace(/^\/uploads\//, ''))).catch(() => undefined);
    }
    await userRepo.setPhoto(req.user!.id, null);
    res.json({ success: true, message: 'Profile photo removed' });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me  (requires `authenticate`)
export const me = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const row = await userRepo.findById(req.user!.id);
    if (!row || row.account_status !== 'ACTIVE') {
      res.status(403).json({ error: 'Forbidden', code: 'ACCOUNT_INACTIVE', message: 'Account is no longer active' });
      return;
    }
    const payload = buildPayload(row);
    const tenant = await tenantRepo.findById(row.tenant_id);
    res.json({ success: true, user: await presentUser(payload, row, tenant), tenant: tenant ? presentTenant(tenant) : null });
  } catch (err) {
    next(err);
  }
};
