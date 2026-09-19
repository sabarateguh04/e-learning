import { BRAND } from '../lib/brand';
import { useVocab } from '../lib/vocab';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BookOpenCheck,
  Eye,
  FileDown,
  Loader2,
  MapPinned,
  Printer,
  Trophy,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { blobErrorMessage, filenameFrom, saveBlob } from '../lib/download';
import { useAnalyticsFilters } from '../lib/useAnalyticsFilters';
import { ExecutiveFilterBar } from '../components/ExecutiveFilterBar';
import { useFetch } from '../lib/hooks';
import { audienceTone } from '../lib/audience';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';
import type { BreakdownLevel, ExecutiveReportResponse, ReportActivity, ReportBreakdownRow, ReportModuleStat, ReportTrainerStat, ReportTrendPoint } from '../types';
import { Badge, ErrorState, PageHeader, Skeleton, cardClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { MotionItem, MotionList } from '../components/motion';

const fmt = new Intl.NumberFormat('id-ID');
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

const BREAKDOWN_TITLE: Record<BreakdownLevel, { title: string; hint: string; col: string }> = {
  provinsi: { title: 'Perbandingan antar provinsi', hint: 'Panorama nasional — setiap provinsi dibandingkan berdampingan', col: 'Provinsi' },
  kota: { title: 'Perbandingan antar kota/kabupaten', hint: 'Rekapitulasi seluruh kota/kabupaten di provinsi Anda', col: 'Kota/Kabupaten' },
  trainer: { title: 'Rincian per trainer', hint: 'Seluruh trainer aktif di cakupan Anda', col: 'Trainer' },
};
const STATUS_META: Record<ReportActivity['status'], { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  APPROVED: { label: 'Disetujui', tone: 'success' },
  PENDING: { label: 'Menunggu', tone: 'warning' },
  REJECTED: { label: 'Ditolak', tone: 'danger' },
};

/* ── Metric card ───────────────────────────────────────────────────────────── */
function Metric({ label, value, hint, icon: Icon, accent = false }: { label: string; value: string; hint: string; icon: LucideIcon; accent?: boolean }) {
  return (
    <div className={`${cardClass} card-interactive p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <div className={`rounded-lg p-2.5 ${accent ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

/* ── Dual-series bar chart (sessions vs module views), hover tooltip ────────── */
function TrendChart({ points }: { points: ReportTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 160;
  const PAD = 10;
  const max = Math.max(1, ...points.flatMap((p) => [p.sessions, p.views]));
  const slot = (W - PAD * 2) / points.length;
  const bw = Math.max(2, (slot - 4) / 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full"
        role="img"
        aria-label="Sesi lapangan dan akses modul per hari, 28 hari terakhir"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * W;
          setHover(Math.min(points.length - 1, Math.max(0, Math.floor((rel - PAD) / slot))));
        }}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={y(max * f)} y2={y(max * f)} strokeWidth={1} className="stroke-slate-100 dark:stroke-slate-800" />
        ))}
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} strokeWidth={1} className="stroke-slate-200 dark:stroke-slate-700" />
        {points.map((p, i) => {
          const x0 = PAD + i * slot + 2;
          return (
            <g key={p.date} opacity={hover === null || hover === i ? 1 : 0.45}>
              <rect x={x0} y={y(p.sessions)} width={bw} height={Math.max(0, H - PAD - y(p.sessions))} rx={2} className="fill-brand-500" />
              <rect x={x0 + bw} y={y(p.views)} width={bw} height={Math.max(0, H - PAD - y(p.views))} rx={2} className="fill-brand-200 dark:fill-brand-700" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>{fmtDay(points[0].date)}</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-500" /> Sesi lapangan</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-brand-200 dark:bg-brand-700" /> Akses modul</span>
        </div>
        <span>{fmtDay(points[points.length - 1].date)}</span>
      </div>
      {active && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900"
          style={{ left: `${((PAD + hover! * slot) / W) * 100}%`, transform: `translateX(${hover! > points.length / 2 ? '-110%' : '10%'})` }}
        >
          <p className="font-medium">{fmtDate(active.date)}</p>
          <p className="text-slate-500 dark:text-slate-400">{active.sessions} sesi · {fmt.format(active.participants)} peserta · {active.views} akses modul</p>
        </div>
      )}
    </div>
  );
}

/* ── Breakdown: horizontal comparison bars ─────────────────────────────────── */
function BreakdownTable({ rows, level }: { rows: ReportBreakdownRow[]; level: BreakdownLevel }) {
  const maxSessions = Math.max(1, ...rows.map((r) => r.sessions));
  const maxViews = Math.max(1, ...rows.map((r) => r.views));
  const columns: Column<ReportBreakdownRow>[] = [
    {
      key: 'name',
      header: BREAKDOWN_TITLE[level].col,
      primary: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          {r.hint && <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{r.hint}</p>}
        </div>
      ),
    },
    { key: 'trainers', header: 'Trainer', align: 'right', hideBelow: 'md', cell: (r) => <span className="tabular-nums">{fmt.format(r.trainers)}</span> },
    {
      key: 'sessions',
      header: 'Sesi lapangan',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.sessions / maxSessions) * 100}%` }} />
          </div>
          <span className="text-xs tabular-nums">{fmt.format(r.sessions)}</span>
        </div>
      ),
    },
    { key: 'participants', header: 'Peserta', align: 'right', hideBelow: 'lg', cell: (r) => <span className="tabular-nums">{fmt.format(r.participants)}</span> },
    { key: 'approved', header: 'Disetujui', align: 'right', hideBelow: 'lg', cell: (r) => <span className="tabular-nums text-slate-500 dark:text-slate-400">{r.approved}/{r.sessions}</span> },
    {
      key: 'views',
      header: 'Akses modul',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(r.views / maxViews) * 100}%` }} />
          </div>
          <span className="text-xs tabular-nums">{fmt.format(r.views)}</span>
        </div>
      ),
    },
    { key: 'modules_read', header: 'Modul dibaca', align: 'right', hideBelow: 'md', cell: (r) => <span className="tabular-nums">{fmt.format(r.modules_read)}</span> },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(r) => String(r.id)} dense emptyMessage="Belum ada wilayah/trainer dengan aktivitas pada cakupan ini." />;
}

/* ── Most accessed modules ─────────────────────────────────────────────────── */
function ModuleAnalytics({ rows }: { rows: ReportModuleStat[] }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  if (!rows.length) return <p className="px-5 py-10 text-center text-xs text-slate-500">Belum ada modul yang disetujui.</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((m) => (
        <li key={m.module_id} className="px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link to={`/modules/${m.module_id}`} className="flex min-w-0 items-center gap-2 text-sm font-medium hover:text-brand-600 dark:hover:text-brand-400">
              <span className="w-4 shrink-0 text-xs text-slate-400">{m.rank}</span>
              <span className="truncate">{m.title}</span>
            </Link>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums">
              <Eye className="h-3.5 w-3.5 text-slate-400" /> {fmt.format(m.views)}
            </span>
          </div>
          <div className="mt-1.5 ml-6 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-out" style={{ width: `${(m.views / max) * 100}%` }} />
          </div>
          <p className="mt-1 ml-6 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className={`rounded px-1.5 py-px font-medium ${audienceTone(m.target_audience)}`}>{m.target_audience}</span>
            <span>{fmt.format(m.unique_viewers)} viewer unik</span>
            <span>·</span>
            <span>{fmt.format(m.presentations)}x dipresentasikan</span>
            <span>·</span>
            <span>{fmt.format(m.sessions)} sesi lapangan</span>
            {m.last_viewed_at && (
              <>
                <span>·</span>
                <span>terakhir {fmtDate(m.last_viewed_at)}</span>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

/* ── Top trainers ──────────────────────────────────────────────────────────── */
const RANK_STYLE: Record<number, string> = {
  1: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  2: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  3: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
};

function TopTrainers({ rows }: { rows: ReportTrainerStat[] }) {
  const vocab = useVocab();
  const columns: Column<ReportTrainerStat>[] = [
    {
      key: 'rank',
      header: '#',
      className: 'w-12',
      cell: (t) => (
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${RANK_STYLE[t.rank] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{t.rank}</span>
      ),
    },
    {
      key: 'trainer',
      header: vocab.trainer,
      primary: true,
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{t.trainer_name}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{t.instansi_name} · {t.territory_name}</p>
        </div>
      ),
    },
    { key: 'reports', header: 'Laporan', align: 'right', cell: (t) => <span className="tabular-nums">{fmt.format(t.report_count)}</span> },
    { key: 'participants', header: 'Peserta', align: 'right', hideBelow: 'lg', cell: (t) => <span className="tabular-nums">{fmt.format(t.participants)}</span> },
    { key: 'uploads', header: 'Materi diunggah', align: 'right', hideBelow: 'md', cell: (t) => <span className="tabular-nums">{fmt.format(t.modules_uploaded)}</span> },
    { key: 'read', header: 'Modul dibaca', align: 'right', hideBelow: 'md', cell: (t) => <span className="tabular-nums">{fmt.format(t.modules_read)}</span> },
    { key: 'score', header: 'Skor', align: 'right', cell: (t) => <Badge tone="brand">{fmt.format(t.activity_score)}</Badge> },
    { key: 'last', header: 'Aktivitas terakhir', hideBelow: 'xl', cell: (t) => <span className="text-xs text-slate-500 dark:text-slate-400">{t.last_activity_at ? fmtDate(t.last_activity_at) : '—'}</span> },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(t) => t.trainer_id} dense emptyMessage="Belum ada trainer aktif pada cakupan ini." />;
}

/* ── Activity & progress ───────────────────────────────────────────────────── */
function ActivityTable({ rows }: { rows: ReportActivity[] }) {
  const columns: Column<ReportActivity>[] = [
    { key: 'date', header: 'Tanggal', className: 'whitespace-nowrap', cell: (a) => <span className="text-xs tabular-nums">{fmtDate(a.created_at)}</span> },
    {
      key: 'trainer',
      header: 'Trainer / instansi',
      primary: true,
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{a.trainer_name}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{a.instansi_name} · {a.territory_name}</p>
        </div>
      ),
    },
    {
      key: 'activity',
      header: 'Judul kegiatan',
      cell: (a) => (
        <div className="min-w-0 max-w-[280px]">
          <p className="truncate">{a.location_name}</p>
          <Link to={`/modules/${a.module_id}`} className="block truncate text-[11px] text-brand-600 hover:underline dark:text-brand-400">{a.module_title}</Link>
        </div>
      ),
    },
    { key: 'audience', header: 'Audiens', hideBelow: 'lg', cell: (a) => <span className="text-xs">{a.audience_category} · {fmt.format(a.participant_count)} org</span> },
    {
      key: 'read',
      header: 'Status baca modul',
      hideBelow: 'md',
      cell: (a) =>
        a.module_read ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><BookOpenCheck className="h-3.5 w-3.5" /> Sudah dibaca</span>
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">Belum dibaca</span>
        ),
    },
    { key: 'status', header: 'Status laporan', cell: (a) => <Badge tone={STATUS_META[a.status].tone}>{STATUS_META[a.status].label}</Badge> },
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(a) => a.id} dense emptyMessage="Belum ada laporan lapangan pada cakupan ini." />;
}

/* ── Export controls ───────────────────────────────────────────────────────── */
function ExportButtons({ query, onError }: { query: string; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const downloadPdf = async () => {
    setBusy(true);
    try {
      const res = await api.get<Blob>(`/reports/executive/pdf${query}`, { responseType: 'blob', timeout: 60_000 });
      saveBlob(res.data, filenameFrom(res, 'laporan-eksekutif.pdf'));
    } catch (err) {
      const msg = await blobErrorMessage(err, 'Gagal menyusun PDF.');
      if (mounted.current) onError(msg);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className={`${secondaryButtonClass} whitespace-nowrap`}>
        <Printer className="h-4 w-4" /> Cetak
      </button>
      <button type="button" onClick={downloadPdf} disabled={busy} className={`${primaryButtonClass} whitespace-nowrap`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        {busy ? 'Menyusun PDF…' : 'Unduh Laporan Resmi (PDF)'}
      </button>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

export function ExecutiveReports() {
  const vocab = useVocab();
  const user = useAuthStore((s) => s.user);
  const tenant = useTenantStore((s) => s.tenant);
  const filters = useAnalyticsFilters();
  const { data, loading, error, refetch } = useFetch<ExecutiveReportResponse>(`/reports/executive${filters.query}`);
  const [exportError, setExportError] = useState<string | null>(null);
  const audienceTotal = useMemo(() => Math.max(1, ...(data?.audience_mix.map((a) => a.sessions) ?? [0])), [data]);

  return (
    <div className="space-y-6 print-report">
      {/* Print-only letterhead */}
      {data && (
        <div className="hidden print:block border-b border-slate-300 pb-3">
          <p className="text-lg font-bold">Laporan Eksekutif</p>
          <p className="text-sm">{tenant?.name ?? BRAND.public.name} · {data.scope.label}</p>
          <p className="text-xs text-slate-500">Disusun oleh {user?.full_name} ({user?.role_label}) · dicetak {new Date(data.generated_at).toLocaleString('id-ID')}</p>
        </div>
      )}

      <PageHeader
        title="Laporan"
        description={`Laporan eksekutif sesuai cakupan Anda: ${data?.scope.label ?? user?.scope?.label ?? '…'}`}
        action={
          data && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Badge tone="brand">{user?.role_label}</Badge>
              <ExportButtons query={filters.query} onError={setExportError} />
            </div>
          )
        }
      />

      {exportError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 print:hidden">
          <span>Gagal mengunduh laporan: {exportError}</span>
          <button type="button" onClick={() => setExportError(null)} className="text-xs font-medium underline">Tutup</button>
        </div>
      )}

      <ExecutiveFilterBar values={filters.values} onChange={filters.set} onClear={filters.clear} active={filters.active} />

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading || !data ? (
        <ReportSkeleton />
      ) : (
        <>
          {/* Metrics */}
          <MotionList className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MotionItem><Metric label="Sesi Lapangan" value={fmt.format(data.summary.total_sessions)} hint={`${data.summary.approval_rate}% disetujui · ${data.summary.pending_reviews} menunggu tinjauan`} icon={MapPinned} /></MotionItem>
            <MotionItem><Metric label="Audiens Terjangkau" value={fmt.format(data.summary.total_participants)} hint={`rata-rata ${fmt.format(data.summary.avg_participants)} peserta / sesi`} icon={UsersRound} /></MotionItem>
            <MotionItem><Metric label="Akses Modul" value={fmt.format(data.summary.total_views)} hint={`${fmt.format(data.summary.unique_viewers)} viewer unik · ${fmt.format(data.summary.views_7d)} dalam 7 hari`} icon={Eye} accent /></MotionItem>
            <MotionItem><Metric label={`${vocab.trainer} Aktif`} value={`${fmt.format(data.summary.active_trainers)} / ${fmt.format(data.summary.total_trainers)}`} hint={`${fmt.format(data.summary.modules_uploaded)} materi diunggah · ${fmt.format(data.summary.modules_accessed)}/${fmt.format(data.summary.modules_available)} modul diakses`} icon={Activity} /></MotionItem>
          </MotionList>

          {/* Trend */}
          <section className={`${cardClass} p-5 print-break-inside-avoid`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Tren aktivitas {data.trend.length} hari</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmtDate(data.period.from)} – {fmtDate(data.period.to)} · arahkan kursor untuk detail</p>
              </div>
              <span className="text-xs text-slate-400">Diperbarui {new Date(data.generated_at).toLocaleTimeString('id-ID')}</span>
            </div>
            <TrendChart points={data.trend} />
          </section>

          {/* Breakdown */}
          <section className={`${cardClass} print-break-inside-avoid`}>
            <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="rounded-lg bg-sky-50 p-2 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"><MapPinned className="h-4 w-4" /></div>
              <div>
                <h2 className="text-sm font-semibold">{BREAKDOWN_TITLE[data.breakdown_level].title}</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{BREAKDOWN_TITLE[data.breakdown_level].hint}</p>
              </div>
            </header>
            <BreakdownTable rows={data.breakdown} level={data.breakdown_level} />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Module analytics */}
            <section className={`${cardClass} lg:col-span-2 print-break-inside-avoid`}>
              <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"><Eye className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-sm font-semibold">Analitik Modul</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Modul paling sering diakses beserta jumlah viewer di cakupan Anda</p>
                </div>
              </header>
              <ModuleAnalytics rows={data.top_modules} />
              {data.audience_mix.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Komposisi audiens sesi</p>
                  <ul className="space-y-1.5">
                    {data.audience_mix.map((a) => (
                      <li key={a.audience_category} className="flex items-center gap-2 text-xs">
                        <span className="w-32 truncate">{a.audience_category}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-slate-400 dark:bg-slate-500" style={{ width: `${(a.sessions / audienceTotal) * 100}%` }} />
                        </div>
                        <span className="w-24 text-right tabular-nums text-slate-500 dark:text-slate-400">{a.sessions} sesi · {fmt.format(a.participants)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Top trainers */}
            <section className={`${cardClass} lg:col-span-3 print-break-inside-avoid`}>
              <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"><Trophy className="h-4 w-4" /></div>
                <div>
                  <h2 className="text-sm font-semibold">Top {vocab.trainer}</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Skor = 3×laporan lapangan + 2×materi diunggah + modul dibaca</p>
                </div>
              </header>
              <TopTrainers rows={data.top_trainers} />
            </section>
          </div>

          {/* Activity & progress */}
          <section className={cardClass}>
            <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"><Activity className="h-4 w-4" /></div>
              <div>
                <h2 className="text-sm font-semibold">Aktivitas & Progres</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{data.activities.length} kegiatan terakhir — trainer per instansi, judul kegiatan, dan status pembacaan modul</p>
              </div>
            </header>
            <ActivityTable rows={data.activities} />
          </section>
        </>
      )}
    </div>
  );
}
