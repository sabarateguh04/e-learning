import { BRAND } from '../config';
import { UserPayload } from '../middlewares/authenticate';
import { ROLE_LABEL, RoleLevel } from '../middlewares/rbacGuard';
import { ReportPdf, fmtDate, fmtNum, fmtTime } from './pdfKit';

/** Shape produced by analyticsController.buildExecutiveAnalytics(). */
export interface ExecutiveAnalytics {
  scope: { label: string };
  filters: unknown;
  period: { from: string; to: string };
  generated_at: string;
  summary: { total_sessions: number; total_participants: number; avg_participants: number; pending_reviews: number; approval_rate: number; active_trainers: number; modules_used: number; total_module_views: number };
  top_trainers: Array<{ rank: number; trainer_name: string; territory_name: string; report_count: number; participants: number; approved_count: number }>;
  top_modules: Array<{ rank: number; title: string; category: string; usage_count: number; participants: number; views: number }>;
  top_viewed_modules: Array<{ rank: number; title: string; target_audience: string; views: number; public_views: number; presentations: number }>;
  trend: Array<{ date: string; sessions: number; participants: number }>;
}

const DISCLAIMER = 'Dokumen ini dihasilkan secara otomatis oleh sistem berdasarkan data yang tercatat pada saat pencetakan dan mengikuti cakupan wilayah penugasan penyusun.';

/** Dashboard summary PDF (GET /api/analytics/executive/report.pdf). */
export function renderExecutiveReport(res: NodeJS.WritableStream, user: UserPayload, tenantName: string, data: ExecutiveAnalytics) {
  const now = new Date(data.generated_at);
  const pdf = new ReportPdf(res, { title: 'Laporan Eksekutif', org: tenantName, generatedAt: now });
  const W = pdf.W;
  const role = ROLE_LABEL[user.role_level as RoleLevel] ?? '—';

  pdf.header(`${tenantName} · ${BRAND.app} · ${BRAND.tagline}`, [
    ['Cakupan data', data.scope.label],
    ['Disusun oleh', `${user.full_name} (${role})`],
    ['Periode aktivitas', `${data.period.from} s.d. ${data.period.to}`],
    ['Dicetak', `${fmtDate(now)} ${fmtTime(now)}`],
  ]);

  pdf.heading('Ringkasan');
  pdf.cards([
    ['Total sesi', fmtNum(data.summary.total_sessions)],
    ['Audiens terjangkau', fmtNum(data.summary.total_participants)],
    ['Rata-rata peserta / sesi', fmtNum(data.summary.avg_participants)],
    ['Trainer aktif', fmtNum(data.summary.active_trainers)],
    ['Modul dipakai', fmtNum(data.summary.modules_used)],
    ['Total tayangan modul', fmtNum(data.summary.total_module_views)],
    ['Menunggu tinjauan', fmtNum(data.summary.pending_reviews)],
    ['Tingkat persetujuan', `${data.summary.approval_rate}%`],
  ]);

  pdf.heading('Aktivitas harian (sesi per hari pada periode laporan)');
  pdf.barChart(data.trend.map((t) => ({ label: t.date.slice(5), a: t.sessions })), ['Sesi']);

  pdf.heading('Trainer paling aktif');
  pdf.table(
    [{ h: '#', w: 26 }, { h: 'Trainer', w: 175 }, { h: 'Wilayah', w: 128 }, { h: 'Sesi', w: 50, align: 'right' }, { h: 'Peserta', w: 60, align: 'right' }, { h: 'Disetujui', w: W - 439, align: 'right' }],
    data.top_trainers.map((t) => [String(t.rank), t.trainer_name, t.territory_name, fmtNum(t.report_count), fmtNum(t.participants), `${t.approved_count}/${t.report_count}`]),
  );

  pdf.heading('Modul paling sering dipresentasikan');
  pdf.table(
    [{ h: '#', w: 26 }, { h: 'Modul', w: 228 }, { h: 'Kategori', w: 95 }, { h: 'Sesi', w: 45, align: 'right' }, { h: 'Peserta', w: 55, align: 'right' }, { h: 'Tayangan', w: W - 449, align: 'right' }],
    data.top_modules.map((m) => [String(m.rank), m.title, m.category, fmtNum(m.usage_count), fmtNum(m.participants), fmtNum(m.views)]),
  );

  pdf.heading('Modul paling banyak dilihat (viewer count)');
  pdf.table(
    [{ h: '#', w: 26 }, { h: 'Modul', w: 218 }, { h: 'Jenjang', w: 75 }, { h: 'Tayangan', w: 55, align: 'right' }, { h: 'Publik', w: 50, align: 'right' }, { h: 'Presentasi', w: W - 424, align: 'right' }],
    data.top_viewed_modules.map((m) => [String(m.rank), m.title, m.target_audience, fmtNum(m.views), fmtNum(m.public_views), fmtNum(m.presentations)]),
  );

  pdf.signature(user.full_name, role, DISCLAIMER);
  pdf.end();
}
