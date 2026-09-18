import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserPayload } from '../middlewares/authenticate';
import { ROLE_LABEL, RoleLevel } from '../middlewares/rbacGuard';
import { executiveReportRepo, BreakdownLevel } from '../repositories/executiveReportRepo';
import { tenantRepo } from '../repositories/tenantRepo';
import { AnalyticsFilters, EMPTY_FILTERS, describeScope, resolveFilters, ScopeDescriptor } from '../services/scope';
import { chosenNames, FilterOptions, loadFilterOptions } from '../services/filterOptions';
import { ReportPdf, fmtDate, fmtNum, fmtShortDate, fmtTime } from '../services/pdfKit';

const n = (v: unknown) => Number(v ?? 0);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export interface ExecutiveReport {
  scope: ScopeDescriptor;
  filters: FilterOptions;
  breakdown_level: BreakdownLevel;
  generated_at: string;
  period: { from: string; to: string };
  summary: {
    total_sessions: number; total_participants: number; avg_participants: number;
    pending_reviews: number; approved: number; rejected: number; approval_rate: number;
    active_trainers: number; total_trainers: number; pending_accounts: number; modules_used: number; cities_covered: number;
    modules_available: number; modules_uploaded: number;
    total_views: number; internal_views: number; public_views: number; presentations: number; unique_viewers: number; modules_accessed: number; views_7d: number;
  };
  top_modules: Array<{ rank: number; module_id: string; title: string; target_audience: string; category: string; views: number; internal_views: number; public_views: number; presentations: number; unique_viewers: number; sessions: number; last_viewed_at: string | null }>;
  top_trainers: Array<{ rank: number; trainer_id: string; trainer_name: string; employee_id: string; instansi_name: string; organisasi_name: string; territory_name: string; report_count: number; participants: number; approved_count: number; modules_uploaded: number; modules_read: number; activity_score: number; last_activity_at: string | null }>;
  activities: Array<{ id: string; created_at: string; status: string; trainer_name: string; instansi_name: string; organisasi_name: string; territory_name: string; module_id: string; module_title: string; module_read: boolean; location_name: string; audience_category: string; participant_count: number }>;
  breakdown: Array<{ id: string | number; name: string; hint: string; trainers: number; sessions: number; participants: number; approved: number; views: number; modules_read: number }>;
  audience_mix: Array<{ audience_category: string; sessions: number; participants: number }>;
  trend: Array<{ date: string; sessions: number; participants: number; views: number }>;
}

/** Aggregates the executive report for the caller — every query is fenced by role + territory. */
export async function buildExecutiveReport(user: UserPayload, filters: AnalyticsFilters = EMPTY_FILTERS, query: Record<string, unknown> = {}): Promise<ExecutiveReport> {
  const [d, options] = await Promise.all([executiveReportRepo.build(user, { filters }), loadFilterOptions(user, query)]);
  const total_sessions = n(d.summary.total_sessions);
  const approved = n(d.summary.approved);

  const byDay = new Map(d.daily.map((r) => [new Date(r.d).toISOString().slice(0, 10), r]));
  const trend = Array.from({ length: d.window.days }, (_, i) => {
    const date = new Date(Date.parse(d.window.from) + i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(date);
    return { date, sessions: n(row?.sessions), participants: n(row?.participants), views: n(row?.views) };
  });

  return {
    scope: describeScope(user, filters, chosenNames(options)),
    filters: { ...options, selected: filters },
    breakdown_level: d.breakdown_level,
    generated_at: new Date().toISOString(),
    period: { from: d.window.from, to: d.window.to },
    summary: {
      total_sessions,
      total_participants: n(d.summary.total_participants),
      avg_participants: n(d.summary.avg_participants),
      pending_reviews: n(d.summary.pending_reviews),
      approved,
      rejected: n(d.summary.rejected),
      approval_rate: total_sessions ? Math.round((approved / total_sessions) * 100) : 0,
      active_trainers: n(d.summary.active_trainers),
      total_trainers: n(d.trainer_pool.active_accounts),
      pending_accounts: n(d.trainer_pool.pending_accounts),
      modules_used: n(d.summary.modules_used),
      cities_covered: n(d.summary.cities_covered),
      modules_available: n(d.trainer_pool.modules_available),
      modules_uploaded: n(d.trainer_pool.modules_uploaded),
      total_views: n(d.views_summary.total_views),
      internal_views: n(d.views_summary.internal_views),
      public_views: n(d.views_summary.public_views),
      presentations: n(d.views_summary.presentations),
      unique_viewers: n(d.views_summary.unique_viewers),
      modules_accessed: n(d.views_summary.modules_accessed),
      views_7d: n(d.views_summary.views_7d),
    },
    top_modules: d.top_modules.map((m, i) => ({
      rank: i + 1, module_id: m.module_id, title: m.title, target_audience: m.target_audience, category: m.category,
      views: n(m.views), internal_views: n(m.internal_views), public_views: n(m.public_views), presentations: n(m.presentations),
      unique_viewers: n(m.unique_viewers), sessions: n(m.sessions), last_viewed_at: iso(m.last_viewed_at),
    })),
    top_trainers: d.top_trainers.map((t, i) => ({
      rank: i + 1, trainer_id: t.trainer_id, trainer_name: t.trainer_name, employee_id: t.employee_id,
      instansi_name: t.instansi_name, organisasi_name: t.organisasi_name, territory_name: t.territory_name,
      report_count: n(t.report_count), participants: n(t.participants), approved_count: n(t.approved_count),
      modules_uploaded: n(t.modules_uploaded), modules_read: n(t.modules_read), activity_score: n(t.activity_score),
      last_activity_at: n(t.activity_score) ? iso(t.last_activity_at) : null,
    })),
    activities: d.activities.map((a) => ({
      id: a.id, created_at: iso(a.created_at)!, status: a.status, trainer_name: a.trainer_name, instansi_name: a.instansi_name,
      organisasi_name: a.organisasi_name, territory_name: a.territory_name, module_id: a.module_id, module_title: a.module_title,
      module_read: Boolean(n(a.module_read)), location_name: a.location_name, audience_category: a.audience_category, participant_count: n(a.participant_count),
    })),
    breakdown: d.breakdown.map((b) => ({
      id: b.id, name: b.name, hint: b.hint ?? '', trainers: n(b.trainers), sessions: n(b.sessions), participants: n(b.participants),
      approved: n(b.approved), views: n(b.views), modules_read: n(b.modules_read),
    })),
    audience_mix: d.audience_mix.map((a) => ({ audience_category: a.audience_category, sessions: n(a.sessions), participants: n(a.participants) })),
    trend,
  };
}

// GET /api/reports/executive
export const getExecutiveReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { filters } = resolveFilters(req.user!, req.query as Record<string, unknown>);
    res.json({ success: true, ...(await buildExecutiveReport(req.user!, filters, req.query as Record<string, unknown>)) });
  } catch (err) {
    next(err);
  }
};

const BREAKDOWN_TITLE: Record<BreakdownLevel, string> = { provinsi: 'Perbandingan antar provinsi', kota: 'Perbandingan antar kota/kabupaten', trainer: 'Rincian per trainer' };
const STATUS_ID: Record<string, string> = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak' };

// GET /api/reports/executive/pdf — official, print-ready report for the caller's scope
export const downloadExecutiveReportPdf = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user!;
    const { filters } = resolveFilters(user, req.query as Record<string, unknown>);
    const [data, tenant] = await Promise.all([buildExecutiveReport(user, filters, req.query as Record<string, unknown>), tenantRepo.findById(user.tenant_id)]);
    const org = tenant?.name ?? 'Platform E-Learning';
    const now = new Date(data.generated_at);
    const role = ROLE_LABEL[user.role_level as RoleLevel] ?? '—';
    const slug = data.scope.label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-eksekutif-${slug}-${now.toISOString().slice(0, 10)}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');

    const pdf = new ReportPdf(res, { title: 'Laporan Eksekutif', org, generatedAt: now });
    const W = pdf.W;
    const s = data.summary;

    pdf.header(`${org} · E-Learning & Pemantauan Lapangan`, [
      ['Cakupan data', data.scope.label],
      ['Disusun oleh', `${user.full_name} (${role})`],
      ['Periode', `${fmtShortDate(data.period.from)} – ${fmtShortDate(data.period.to)} (${data.trend.length} hari)`],
      ['Dicetak', `${fmtDate(now)} ${fmtTime(now)}`],
    ]);

    pdf.heading('Ringkasan kinerja', 'Seluruh angka dibatasi ketat pada cakupan wilayah penugasan penyusun.');
    pdf.cards([
      ['Sesi lapangan', fmtNum(s.total_sessions)],
      ['Audiens terjangkau', fmtNum(s.total_participants)],
      ['Tingkat persetujuan', `${s.approval_rate}%`],
      ['Menunggu tinjauan', fmtNum(s.pending_reviews)],
      ['Trainer aktif / terdaftar', `${fmtNum(s.active_trainers)} / ${fmtNum(s.total_trainers)}`],
      ['Total akses modul', fmtNum(s.total_views)],
      ['Viewer unik', fmtNum(s.unique_viewers)],
      ['Modul diakses / tersedia', `${fmtNum(s.modules_accessed)} / ${fmtNum(s.modules_available)}`],
    ]);

    pdf.heading(`Tren ${data.trend.length} hari`, 'Sesi lapangan (biru tua) dan akses modul (biru muda) per hari.');
    pdf.barChart(data.trend.map((t) => ({ label: t.date.slice(5), a: t.sessions, b: t.views })), ['Sesi lapangan', 'Akses modul']);

    pdf.heading(BREAKDOWN_TITLE[data.breakdown_level]);
    pdf.table(
      [{ h: data.breakdown_level === 'trainer' ? 'Trainer' : 'Wilayah', w: 170 }, { h: 'Trainer', w: 45, align: 'right' }, { h: 'Sesi', w: 45, align: 'right' }, { h: 'Peserta', w: 55, align: 'right' }, { h: 'Disetujui', w: 55, align: 'right' }, { h: 'Akses', w: 60, align: 'right' }, { h: 'Modul dibaca', w: W - 430, align: 'right' }],
      data.breakdown.map((b) => [b.name, fmtNum(b.trainers), fmtNum(b.sessions), fmtNum(b.participants), fmtNum(b.approved), fmtNum(b.views), fmtNum(b.modules_read)]),
    );

    pdf.heading('Analitik modul — paling sering diakses', 'Jumlah viewer dihitung dari log akses pengguna di dalam cakupan.');
    pdf.table(
      [{ h: '#', w: 22 }, { h: 'Modul', w: 185 }, { h: 'Jenjang', w: 65 }, { h: 'Viewer', w: 45, align: 'right' }, { h: 'Unik', w: 40, align: 'right' }, { h: 'Publik', w: 45, align: 'right' }, { h: 'Presentasi', w: 55, align: 'right' }, { h: 'Sesi', w: W - 457, align: 'right' }],
      data.top_modules.map((m) => [String(m.rank), m.title, m.target_audience, fmtNum(m.views), fmtNum(m.unique_viewers), fmtNum(m.public_views), fmtNum(m.presentations), fmtNum(m.sessions)]),
    );

    pdf.heading('Top trainer', 'Skor aktivitas = 3×laporan lapangan + 2×materi diunggah + modul dibaca.');
    pdf.table(
      [{ h: '#', w: 22 }, { h: 'Trainer', w: 130 }, { h: 'Instansi / wilayah', w: 125 }, { h: 'Laporan', w: 45, align: 'right' }, { h: 'Peserta', w: 45, align: 'right' }, { h: 'Unggah', w: 42, align: 'right' }, { h: 'Dibaca', w: 40, align: 'right' }, { h: 'Skor', w: W - 449, align: 'right' }],
      data.top_trainers.map((t) => [String(t.rank), t.trainer_name, `${t.instansi_name} · ${t.territory_name}`, fmtNum(t.report_count), fmtNum(t.participants), fmtNum(t.modules_uploaded), fmtNum(t.modules_read), fmtNum(t.activity_score)]),
    );

    pdf.heading('Aktivitas & progres terbaru', `${data.activities.length} kegiatan terakhir di dalam cakupan.`);
    pdf.table(
      [{ h: 'Tanggal', w: 58 }, { h: 'Trainer', w: 90 }, { h: 'Instansi', w: 80 }, { h: 'Kegiatan / modul', w: 125 }, { h: 'Jml', w: 38, align: 'right' }, { h: 'Dibaca', w: 52 }, { h: 'Status', w: W - 443 }],
      data.activities.slice(0, 40).map((a) => [fmtShortDate(a.created_at), a.trainer_name, a.instansi_name, `${a.location_name} · ${a.module_title}`, fmtNum(a.participant_count), a.module_read ? 'Sudah' : 'Belum', STATUS_ID[a.status] ?? a.status]),
    );

    pdf.signature(user.full_name, role, 'Dokumen ini dihasilkan secara otomatis oleh sistem berdasarkan data yang tercatat pada saat pencetakan dan mengikuti cakupan wilayah penugasan penyusun.');
    pdf.end();
  } catch (err) {
    next(err);
  }
};
