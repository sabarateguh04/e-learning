import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';
import { reportRepo } from '../repositories/reportRepo';
import { canReviewReport } from '../services/approval';

/**
 * Loads the field report and enforces the hierarchical approval rule:
 * the caller must be the trainer's direct supervisor (one role level above,
 * same kota/provinsi) or Super Admin. Attaches the report to `req.report`.
 * Runs after `authenticate` + `rbacGuard(EXECUTIVE_ROLES)`.
 */
export const reportReviewGuard = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const report = await reportRepo.findById(req.params.id as string);
    if (!report || report.tenant_id !== req.tenantId) {
      res.status(404).json({ error: 'Not Found', message: 'Laporan tidak ditemukan' });
      return;
    }
    const decision = canReviewReport(req.user!, report);
    if (!decision.allowed) {
      res.status(403).json({ error: 'Forbidden', message: decision.reason });
      return;
    }
    if (report.status !== 'PENDING') {
      res.status(409).json({ error: 'Conflict', message: `Laporan sudah ${report.status === 'APPROVED' ? 'disetujui' : 'ditolak'} sebelumnya` });
      return;
    }
    req.report = report;
    next();
  } catch (err) {
    next(err);
  }
};
