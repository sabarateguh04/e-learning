import { Request, Response, NextFunction } from 'express';
import { masterDataRepo, LEGACY_TYPES, LegacyType } from '../repositories/masterDataRepo';

/**
 * Public read-only reference data for cascading dropdowns
 * (registration is unauthenticated, so these are not behind `authenticate`).
 *
 *   GET /api/master/provinsi
 *   GET /api/master/kota?provinsi_id=2
 *   GET /api/master/instansi
 *   GET /api/master/organisasi?instansi_id=ins-bkn
 *   GET /api/master/satker?org_id=org-...
 *   GET /api/master/sub-org?satker_id=stk-...
 */
type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const wrap = (fn: Handler): Handler => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export const provinsi = wrap(async (_req, res) => {
  const data = await masterDataRepo.listProvinsi();
  res.json({ success: true, total: data.length, data: data.map(({ id, nama, kode }) => ({ id, nama, kode })) });
});

export const kota = wrap(async (req, res) => {
  const raw = req.query.provinsi_id ?? req.query.province_id;
  const provinsiId = raw ? Number(raw) : null;
  const data = await masterDataRepo.listKota(Number.isFinite(provinsiId) && provinsiId ? provinsiId : null);
  res.json({ success: true, total: data.length, data: data.map(({ id, provinsi_id, nama, kode }) => ({ id, provinsi_id, nama, kode })) });
});

const PARENT_PARAM: Record<LegacyType, string | null> = { instansi: null, organisasi: 'instansi_id', satker: 'org_id', sub_org: 'satker_id' };

export const legacy = (type: LegacyType) =>
  wrap(async (req, res) => {
    const param = PARENT_PARAM[type];
    const parentId = param ? str(req.query[param]) : null;
    if (param && !parentId) {
      // A child level is only meaningful under a parent — return nothing rather than the whole table.
      res.json({ success: true, type, parent: { param, value: null }, total: 0, data: [] });
      return;
    }
    const includeUnassigned = req.query.include_unassigned === '1' || req.query.include_unassigned === 'true';
    let data;
    let fallback = false;
    if (includeUnassigned) {
      data = await masterDataRepo.listLegacy(type, parentId, true);
    } else if (parentId) {
      ({ rows: data, fallback } = await masterDataRepo.listChildren(type, parentId));
    } else {
      data = await masterDataRepo.listLegacy(type, null, false);
    }
    res.json({
      success: true,
      type,
      parent: param ? { param, value: parentId, include_unassigned: includeUnassigned } : null,
      /** true = the parent has no registered children; the list shows unassigned rows instead */
      fallback,
      total: data.length,
      data: data.map(({ id, nama, parent_id }) => ({ id, nama, parent_id, unassigned: parent_id === null && type !== 'instansi' })),
    });
  });

export const isLegacyType = (t: string): t is LegacyType => (LEGACY_TYPES as readonly string[]).includes(t);
