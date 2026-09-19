import { BRAND } from '../config';
import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/db';
import { ROLE } from '../middlewares/rbacGuard';
import { FieldReport } from '../repositories/reportRepo';
import { notificationRepo } from '../repositories/notificationRepo';
import { approverLabel } from './approval';
import { sendMail } from './mailer';

interface Supervisor extends RowDataPacket {
  id: string;
  full_name: string;
  email: string | null;
}

/**
 * Direct supervisors of a report = every ACTIVE executive holding the required
 * approver role in the report's territory (kota → provinsi → national) and, for
 * kota/provinsi, in the trainer's own instansi (executives without a mapping still qualify).
 */
export async function findDirectSupervisors(report: Pick<FieldReport, 'tenant_id' | 'approver_role_level' | 'kota_id' | 'provinsi_id'> & { trainer_instansi_id?: string | null; trainer_satker_id?: string | null }): Promise<Supervisor[]> {
  const level = report.approver_role_level ?? ROLE.EXEC_NATIONAL;
  const where = ['u.tenant_id = ?', 'u.role_level = ?', "u.account_status = 'ACTIVE'"];
  const params: unknown[] = [report.tenant_id, level];
  if (level === ROLE.UNIT_HEAD) { where.push('u.legacy_satker_id = ?'); params.push(report.trainer_satker_id ?? '-'); }
  if (level === ROLE.EXEC_CITY) { where.push('u.kota_id = ?'); params.push(report.kota_id ?? -1); }
  if (level === ROLE.EXEC_PROVINCE) { where.push('u.provinsi_id = ?'); params.push(report.provinsi_id ?? -1); }
  if (level !== ROLE.EXEC_NATIONAL && report.trainer_instansi_id) { where.push('(u.legacy_instansi_id = ? OR u.legacy_instansi_id IS NULL)'); params.push(report.trainer_instansi_id); }
  const [rows] = await getPool().query<Supervisor[]>(`SELECT u.id, u.full_name, u.email FROM tbl_elearning_users u WHERE ${where.join(' AND ')}`, params);
  return rows;
}

/**
 * Fires when a trainer submits a field report: in-app notification for every
 * direct supervisor, plus an e-mail for those with an address on file.
 * Never throws — a notification failure must not fail the submission.
 */
export async function notifyReportSubmitted(report: FieldReport): Promise<{ recipients: number; emails: number }> {
  try {
    const supervisors = await findDirectSupervisors(report);
    const title = 'Laporan lapangan baru menunggu persetujuan Anda';
    const body = `${report.trainer_name} (${report.territory_name}) mengirim laporan "${report.location_name}" — modul ${report.module_title}, ${report.participant_count} peserta.`;
    const link = `/reports?status=PENDING&highlight=${report.id}`;

    await notificationRepo.createMany({ tenant_id: report.tenant_id, recipient_ids: supervisors.map((s) => s.id), type: 'REPORT_SUBMITTED', title, body, link, report_id: report.id });

    const withEmail = supervisors.filter((s) => s.email);
    await Promise.all(
      withEmail.map((s) =>
        sendMail({
          to: s.email!,
          subject: `[${BRAND.app}] ${title}`,
          text:
            `Yth. ${s.full_name},\n\n${body}\n\n` +
            `Sebagai ${approverLabel(report)} Anda adalah atasan langsung yang berwenang menyetujui atau menolak laporan ini.\n` +
            `Buka Inbox Persetujuan Laporan untuk memberikan keputusan.\n\n— ${BRAND.app} · ${BRAND.tagline}`,
        }).catch((err) => console.error('[notify] mail failed', s.email, err)),
      ),
    );
    return { recipients: supervisors.length, emails: withEmail.length };
  } catch (err) {
    console.error('[notify] report submitted', err);
    return { recipients: 0, emails: 0 };
  }
}
