import { UserPayload } from '../middlewares/authenticate';
import { ROLE, ROLE_LABEL, RoleLevel } from '../middlewares/rbacGuard';

/** The subset of a field report the approval rules need. */
export interface ReportForApproval {
  tenant_id: string;
  trainer_id: string;
  provinsi_id: number | null;
  kota_id: number | null;
  provinsi_name?: string | null;
  kota_name?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approver_role_level?: number | null;
}

/**
 * Hierarchical approval — one level above the submitter, matched on territory:
 *   trainer with kota      -> Eksekutif Kota (3) of that kota
 *   trainer with provinsi  -> Eksekutif Provinsi (2) of that provinsi
 *   trainer national-only  -> Eksekutif Nasional (1)
 * Super Admin (0) keeps an override for exceptional cases; the review records
 * which path was used so it stays transparent in the inbox and analytics.
 */
export const requiredApproverLevel = (r: Pick<ReportForApproval, 'kota_id' | 'provinsi_id'>): RoleLevel =>
  r.kota_id ? ROLE.EXEC_CITY : r.provinsi_id ? ROLE.EXEC_PROVINCE : ROLE.EXEC_NATIONAL;

/** Human label for the approver position, e.g. "Eksekutif Kota · Kota Depok". */
export const approverLabel = (r: ReportForApproval): string => {
  const level = (r.approver_role_level as RoleLevel | null | undefined) ?? requiredApproverLevel(r);
  const territory = level === ROLE.EXEC_CITY ? r.kota_name : level === ROLE.EXEC_PROVINCE ? r.provinsi_name : null;
  return territory ? `${ROLE_LABEL[level]} · ${territory}` : ROLE_LABEL[level];
};

export type ReviewDecision = { allowed: true; path: 'DIRECT_SUPERVISOR' | 'SUPER_ADMIN_OVERRIDE' } | { allowed: false; reason: string };

/** Can `user` approve/reject this report? Level must be exactly one above the trainer (or Super Admin), territory must match. */
export const canReviewReport = (user: UserPayload, r: ReportForApproval): ReviewDecision => {
  if (user.tenant_id !== r.tenant_id) return { allowed: false, reason: 'Laporan berada di luar instansi Anda' };
  if (user.role_level === ROLE.SUPER_ADMIN) return { allowed: true, path: 'SUPER_ADMIN_OVERRIDE' };

  const required = (r.approver_role_level as RoleLevel | null | undefined) ?? requiredApproverLevel(r);
  if (user.role_level !== required) {
    return { allowed: false, reason: `Persetujuan laporan ini adalah wewenang ${approverLabel(r)} (atasan langsung trainer)` };
  }
  switch (required) {
    case ROLE.EXEC_CITY:
      if (user.kota_id !== r.kota_id) return { allowed: false, reason: `Laporan berasal dari ${r.kota_name ?? 'kota lain'}, di luar wilayah kota Anda` };
      break;
    case ROLE.EXEC_PROVINCE:
      if (user.provinsi_id !== r.provinsi_id) return { allowed: false, reason: `Laporan berasal dari ${r.provinsi_name ?? 'provinsi lain'}, di luar wilayah provinsi Anda` };
      break;
    default:
      break;
  }
  return { allowed: true, path: 'DIRECT_SUPERVISOR' };
};
