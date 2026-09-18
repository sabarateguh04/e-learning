import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { LEGACY_META, LEGACY_TYPES, LegacyType, masterDataRepo } from '../repositories/masterDataRepo';

/** Super Admin CRUD for master data (all tables live in db_elearning). */
type Handler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
const wrap = (fn: Handler): Handler => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isLegacy = (t: string): t is LegacyType => (LEGACY_TYPES as readonly string[]).includes(t);
const fail = (res: Response, errors: Record<string, string>) => res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors });

// GET /api/admin/master/provinsi
export const listProvinsi = wrap(async (_req, res) => {
  const data = await masterDataRepo.listProvinsi();
  res.json({ success: true, total: data.length, data });
});

// POST /api/admin/master/provinsi   { nama, kode? }
export const createProvinsi = wrap(async (req, res) => {
  const nama = str(req.body?.nama);
  const kode = str(req.body?.kode) || null;
  const errors: Record<string, string> = {};
  if (nama.length < 3) errors.nama = 'Province name must be at least 3 characters';
  else if (await masterDataRepo.provinsiExists(nama)) errors.nama = 'Province already exists';
  if (kode && !/^\d{2}$/.test(kode)) errors.kode = 'Province code must be 2 digits';
  if (Object.keys(errors).length) {
    fail(res, errors);
    return;
  }
  res.status(201).json({ success: true, message: `Province "${nama}" added`, data: await masterDataRepo.createProvinsi(nama, kode) });
});

// GET /api/admin/master/kota?provinsi_id=2
export const listKota = wrap(async (req, res) => {
  const provinsiId = req.query.provinsi_id ? Number(req.query.provinsi_id) : null;
  const data = await masterDataRepo.listKota(Number.isFinite(provinsiId) ? provinsiId : null);
  res.json({ success: true, total: data.length, data });
});

// POST /api/admin/master/kota   { provinsi_id, nama, kode? }
export const createKota = wrap(async (req, res) => {
  const provinsiId = Number(req.body?.provinsi_id);
  const nama = str(req.body?.nama);
  const kode = str(req.body?.kode) || null;
  const errors: Record<string, string> = {};
  if (!Number.isInteger(provinsiId) || provinsiId <= 0) errors.provinsi_id = 'Choose a province';
  if (nama.length < 3) errors.nama = 'City name must be at least 3 characters';
  else if (!errors.provinsi_id && (await masterDataRepo.kotaExists(provinsiId, nama))) errors.nama = 'City already exists in that province';
  if (kode && !/^\d{4}$/.test(kode)) errors.kode = 'City code must be 4 digits';
  if (Object.keys(errors).length) {
    fail(res, errors);
    return;
  }
  try {
    res.status(201).json({ success: true, message: `City "${nama}" added`, data: await masterDataRepo.createKota(provinsiId, nama, kode) });
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      fail(res, { provinsi_id: 'Province not found' });
      return;
    }
    throw err;
  }
});

// GET /api/admin/master/:type?parent_id=   (instansi | organisasi | satker | sub_org)
export const listLegacy = wrap(async (req, res) => {
  const type = req.params.type as string;
  if (!isLegacy(type)) {
    res.status(404).json({ error: 'Not Found', message: `Unknown master type "${type}"` });
    return;
  }
  const parentId = str(req.query.parent_id) || null;
  const data = await masterDataRepo.listLegacy(type, parentId, true);
  res.json({ success: true, type, parent_type: LEGACY_META[type].parentType, total: data.length, data });
});

// POST /api/admin/master/:type   { nama, parent_id? }
export const createLegacy = wrap(async (req, res) => {
  const type = req.params.type as string;
  if (!isLegacy(type)) {
    res.status(404).json({ error: 'Not Found', message: `Unknown master type "${type}"` });
    return;
  }
  const meta = LEGACY_META[type];
  const nama = str(req.body?.nama);
  const parentId = str(req.body?.parent_id) || null;
  const errors: Record<string, string> = {};
  if (nama.length < 3) errors.nama = 'Name must be at least 3 characters';
  else if (await masterDataRepo.legacyNameExists(type, nama)) errors.nama = 'Already exists';
  if (parentId && meta.parentType && !(await masterDataRepo.legacyExists(meta.parentType, parentId))) errors.parent_id = `Unknown ${meta.parentType}`;
  if (Object.keys(errors).length) {
    fail(res, errors);
    return;
  }
  res.status(201).json({ success: true, message: `${type} "${nama}" added`, data: await masterDataRepo.createLegacy(type, nama, meta.parentCol ? parentId : null) });
});

// PATCH /api/admin/master/:type/:id   { parent_id }  — curate hierarchy for legacy rows
export const setLegacyParent = wrap(async (req, res) => {
  const type = req.params.type as string;
  if (!isLegacy(type) || !LEGACY_META[type].parentType) {
    res.status(404).json({ error: 'Not Found', message: `"${type}" has no parent level` });
    return;
  }
  const parentId = str(req.body?.parent_id) || null;
  if (parentId && !(await masterDataRepo.legacyExists(LEGACY_META[type].parentType!, parentId))) {
    fail(res, { parent_id: `Unknown ${LEGACY_META[type].parentType}` });
    return;
  }
  if (!(await masterDataRepo.setLegacyParent(type, req.params.id as string, parentId))) {
    res.status(404).json({ error: 'Not Found', message: 'Row not found' });
    return;
  }
  res.json({ success: true, message: 'Parent updated' });
});
