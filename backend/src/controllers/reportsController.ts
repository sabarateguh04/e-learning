import { Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_ROOT } from './authController';
import { AuthenticatedRequest, UserPayload } from '../middlewares/authenticate';
import { AUDIENCE_CATEGORIES, AudienceCategory, FieldReport, reportRepo } from '../repositories/reportRepo';
import { tenantRepo } from '../repositories/tenantRepo';
import { moduleRepo } from '../repositories/moduleRepo';
import { describeScope } from '../services/scope';
import { approverLabel, canReviewReport, requiredApproverLevel } from '../services/approval';
import { notifyReportSubmitted } from '../services/notifications';
import { ROLE_LABEL, RoleLevel } from '../middlewares/rbacGuard';

export type { AudienceCategory, FieldReport, ReportStatus } from '../repositories/reportRepo';
export { AUDIENCE_CATEGORIES };

interface SubmitReportBody {
  module_id?: unknown;
  location_name?: unknown;
  report_date?: unknown;
  audience?: unknown;
  /** legacy alias for `audience` */
  audience_category?: unknown;
  participant_count?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  notes?: unknown;
  /** 2-4 base64 data URLs (image/jpeg|png|webp) */
  photos?: unknown;
}

const PHOTO_MIN = 2;
const PHOTO_MAX = 4;
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const REPORT_PHOTO_DIR = path.join(UPLOAD_ROOT, 'reports');
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Decodes and validates the evidence photos without touching the disk. */
const parsePhotos = (raw: unknown): { photos: Array<{ buffer: Buffer; ext: string }>; error?: string } => {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length < PHOTO_MIN || list.length > PHOTO_MAX) return { photos: [], error: `Unggah ${PHOTO_MIN} sampai ${PHOTO_MAX} foto bukti kegiatan` };
  const photos: Array<{ buffer: Buffer; ext: string }> = [];
  for (const [i, item] of list.entries()) {
    const match = typeof item === 'string' ? DATA_URL_RE.exec(item) : null;
    if (!match) return { photos: [], error: `Foto ke-${i + 1} harus berupa gambar JPEG, PNG, atau WebP` };
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > PHOTO_MAX_BYTES) return { photos: [], error: `Foto ke-${i + 1} melebihi 4 MB` };
    photos.push({ buffer, ext: PHOTO_EXT[match[1]] });
  }
  return { photos };
};

const toNumber = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const validate = (body: SubmitReportBody) => {
  const errors: Record<string, string> = {};

  const module_id = typeof body.module_id === 'string' ? body.module_id.trim() : '';
  if (!module_id) errors.module_id = 'Select the module that was presented';

  const location_name = typeof body.location_name === 'string' ? body.location_name.trim() : '';
  if (!location_name) errors.location_name = 'Nama lokasi/kegiatan wajib diisi';

  const report_date = typeof body.report_date === 'string' ? body.report_date.trim() : '';
  const today = new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(report_date) || Number.isNaN(Date.parse(report_date))) errors.report_date = 'Pilih tanggal pelaksanaan kegiatan';
  else if (report_date > today) errors.report_date = 'Tanggal kegiatan tidak boleh melebihi hari ini';

  const audience = (typeof body.audience === 'string' ? body.audience : body.audience_category) as AudienceCategory;
  if (!AUDIENCE_CATEGORIES.includes(audience)) {
    errors.audience = `Pilih target audiens: ${AUDIENCE_CATEGORIES.join(', ')}`;
  }

  const { photos, error: photoError } = parsePhotos(body.photos);
  if (photoError) errors.photos = photoError;

  const participant_count = toNumber(body.participant_count);
  if (participant_count === null || !Number.isInteger(participant_count) || participant_count < 0) {
    errors.participant_count = 'Participant count must be a non-negative integer';
  }

  const latitude = toNumber(body.latitude);
  if (latitude === null || latitude < -90 || latitude > 90) errors.latitude = 'Latitude must be between -90 and 90';

  const longitude = toNumber(body.longitude);
  if (longitude === null || longitude < -180 || longitude > 180) errors.longitude = 'Longitude must be between -180 and 180';

  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

  return {
    errors,
    photos,
    value: { module_id, location_name, report_date, audience, participant_count: participant_count ?? 0, latitude: latitude ?? 0, longitude: longitude ?? 0, notes },
  };
};

// POST /api/reports  (Trainer only — see reportsRoutes)
export const submitReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user!;
    const { errors, value, photos } = validate(req.body ?? {});

    // The module must be visible (approved + granted) to the trainer's tenant.
    const module = value.module_id ? await moduleRepo.findVisibleById(req.user!, value.module_id) : null;
    if (value.module_id && !module) errors.module_id = 'Module is not available for this tenant';

    if (Object.keys(errors).length > 0) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Validation failed', errors });
      return;
    }

    // Persist the evidence photos first; roll them back if the row insert fails.
    const id = randomUUID();
    await mkdir(REPORT_PHOTO_DIR, { recursive: true });
    const photo_urls: string[] = [];
    for (const [i, p] of photos.entries()) {
      const file = `${id}-${i + 1}.${p.ext}`;
      await writeFile(path.join(REPORT_PHOTO_DIR, file), p.buffer);
      photo_urls.push(`/uploads/reports/${file}`);
    }

    let report;
    try {
      report = await reportRepo.insert({
        id,
        tenant_id: req.tenantId!,
        trainer_id: user.id,
        provinsi_id: user.provinsi_id,
        kota_id: user.kota_id,
        approver_role_level: requiredApproverLevel({ kota_id: user.kota_id, provinsi_id: user.provinsi_id, trainer_satker_id: user.satker_id ?? null }, (await tenantRepo.findById(req.tenantId!))?.approval_flow),
        photo_urls,
        ...value,
      });
    } catch (err) {
      await Promise.all(photo_urls.map((u) => unlink(path.join(UPLOAD_ROOT, u.replace(/^\/uploads\//, ''))).catch(() => undefined)));
      throw err;
    }

    await moduleRepo.increment(module!.id, 'presentation_count');
    await moduleRepo.logView({ tenant_id: user.tenant_id, module_id: module!.id, kind: 'PRESENTATION', user });

    // Alert the direct supervisor(s) — in-app + e-mail. Failures are logged, never surfaced to the trainer.
    const notified = await notifyReportSubmitted(report);

    res.status(201).json({
      success: true,
      message: `Laporan terkirim dan menunggu persetujuan ${approverLabel(report)}${notified.recipients ? ` — ${notified.recipients} atasan langsung telah diberi notifikasi` : ''}`,
      notified,
      data: decorate(user, report),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports?status=PENDING&module_id=mod-001&q=bandung   (scoped bottom-up by role)
export const getReports = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user!;
    const reports = await reportRepo.listScoped(user, {
      status: typeof req.query.status === 'string' ? req.query.status.toUpperCase() : null,
      module_id: typeof req.query.module_id === 'string' ? req.query.module_id : null,
      q: typeof req.query.q === 'string' ? req.query.q.trim() : '',
    });

    res.json({ success: true, total: reports.length, scope: describeScope(user), categories: AUDIENCE_CATEGORIES, data: reports.map((r) => decorate(user, r)) });
  } catch (err) {
    next(err);
  }
};

/** Adds the approval view-model: who must approve, and whether the caller may act on it. */
const decorate = (user: UserPayload, r: FieldReport) => {
  const decision = canReviewReport(user, r);
  return {
    ...r,
    approver_label: approverLabel(r),
    reviewer_role_label: r.reviewed_by_role === null ? null : (ROLE_LABEL[r.reviewed_by_role as RoleLevel] ?? null),
    can_review: r.status === 'PENDING' && decision.allowed,
    review_block_reason: decision.allowed ? null : decision.reason,
  };
};

// POST /api/reports/:id/approve | /reject   (reportReviewGuard has loaded + authorised req.report)
const decide = (status: 'APPROVED' | 'REJECTED') => async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user!;
    const report = req.report!;
    const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 1000) : null;
    if (status === 'REJECTED' && !note) {
      res.status(422).json({ error: 'Unprocessable Entity', message: 'Alasan penolakan wajib diisi', errors: { note: 'Tuliskan alasan penolakan untuk trainer' } });
      return;
    }
    const decision = canReviewReport(user, report);
    if (!decision.allowed) {
      res.status(403).json({ error: 'Forbidden', message: decision.reason });
      return;
    }
    const changed = await reportRepo.review(report.id, { status, reviewer_id: user.id, reviewer_role: user.role_level, path: decision.path, note });
    if (!changed) {
      res.status(409).json({ error: 'Conflict', message: 'Laporan sudah diproses sebelumnya' });
      return;
    }
    const updated = (await reportRepo.findById(report.id))!;
    res.json({
      success: true,
      message: status === 'APPROVED' ? `Laporan disetujui${decision.path === 'SUPER_ADMIN_OVERRIDE' ? ' (override Super Admin)' : ' oleh atasan langsung'}` : 'Laporan ditolak',
      data: decorate(user, updated),
    });
  } catch (err) {
    next(err);
  }
};
export const approveReport = decide('APPROVED');
export const rejectReport = decide('REJECTED');
