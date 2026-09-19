import { UserPayload } from '../middlewares/authenticate';
import { ROLE, ROLE_LABEL, RoleLevel } from '../middlewares/rbacGuard';
import { ApprovalFlow } from './vocabulary';

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
  trainer_instansi_id?: string | null;
  trainer_instansi_name?: string | null;
  trainer_satker_id?: string | null;
  trainer_satker_name?: string | null;
}

/**
 * Hierarchical approval — the submitter's direct supervisor, matched on territory AND instansi.
 * Which role that is depends on the tenant's `approval_flow` (tbl_tenant_settings):
 *
 *   TERRITORY (default, POLRI):   trainer with kota -> Eksekutif Kota (3) of that kota
 *                                 trainer with provinsi -> Eksekutif Provinsi (2)
 *                                 national-only trainer -> Eksekutif Nasional (1)
 *   UNIT_HEAD (schools, branches): trainer with a unit -> Pimpinan Unit (5) of that unit;
 *                                 a trainer without a unit falls back to the TERRITORY rule.
 *
 * Super Admin (0) keeps an override for exceptional cases; the review records which path was used.
 */
export const requiredApproverLevel = (r: Pick<ReportForApproval, 'kota_id' | 'provinsi_id'> & { trainer_satker_id?: string | null }, flow: ApprovalFlow = 'TERRITORY'): RoleLevel => {
  if (flow === 'UNIT_HEAD' && r.trainer_satker_id) return ROLE.UNIT_HEAD;
  return r.kota_id ? ROLE.EXEC_CITY : r.provinsi_id ? ROLE.EXEC_PROVINCE : ROLE.EXEC_NATIONAL;
};

/** Human label for the approver position, e.g. "Eksekutif Kota · Kota Depok" / "Pimpinan Unit · SMA 1 Depok". */
export const approverLabel = (r: ReportForApproval): string => {
  const level = (r.approver_role_level as RoleLevel | null | undefined) ?? requiredApproverLevel(r);
  const where = level === ROLE.UNIT_HEAD ? r.trainer_satker_name : level === ROLE.EXEC_CITY ? r.kota_name : level === ROLE.EXEC_PROVINCE ? r.provinsi_name : null;
  return where ? `${ROLE_LABEL[level]} · ${where}` : ROLE_LABEL[level];
};

export type ReviewDecision = { allowed: true; path: 'DIRECT_SUPERVISOR' | 'SUPER_ADMIN_OVERRIDE' } | { allowed: false; reason: string };

/** Can `user` approve/reject this report? Level must be the recorded approver level (or Super Admin); territory, instansi and unit must match. */
export const canReviewReport = (user: UserPayload, r: ReportForApproval): ReviewDecision => {
  if (user.tenant_id !== r.tenant_id) return { allowed: false, reason: 'Laporan berada di luar instansi Anda' };
  if (user.role_level === ROLE.SUPER_ADMIN) return { allowed: true, path: 'SUPER_ADMIN_OVERRIDE' };

  const required = (r.approver_role_level as RoleLevel | null | undefined) ?? requiredApproverLevel(r);
  if (user.role_level !== required) {
    return { allowed: false, reason: `Persetujuan laporan ini adalah wewenang ${approverLabel(r)} (atasan langsung)` };
  }
  switch (required) {
    case ROLE.UNIT_HEAD:
      if (!user.satker_id || user.satker_id !== r.trainer_satker_id) return { allowed: false, reason: `Laporan berasal dari ${r.trainer_satker_name ?? 'unit lain'}, di luar unit yang Anda pimpin` };
      break;
    case ROLE.EXEC_CITY:
      if (user.kota_id !== r.kota_id) return { allowed: false, reason: `Laporan berasal dari ${r.kota_name ?? 'kota lain'}, di luar wilayah kota Anda` };
      break;
    case ROLE.EXEC_PROVINCE:
      if (user.provinsi_id !== r.provinsi_id) return { allowed: false, reason: `Laporan berasal dari ${r.provinsi_name ?? 'provinsi lain'}, di luar wilayah provinsi Anda` };
      break;
    default:
      break;
  }
  if (required !== ROLE.EXEC_NATIONAL && user.instansi_id && r.trainer_instansi_id && user.instansi_id !== r.trainer_instansi_id) {
    return { allowed: false, reason: `Laporan berasal dari trainer ${r.trainer_instansi_name ?? 'instansi lain'}, di luar instansi Anda` };
  }
  return { allowed: true, path: 'DIRECT_SUPERVISOR' };
};
