import { useVocab } from '../lib/vocab';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, BarChart3, BookOpen, Clock, Eye, FileDown, Inbox, Loader2, Users, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { blobErrorMessage, filenameFrom, saveBlob } from '../lib/download';
import { useAnalyticsFilters } from '../lib/useAnalyticsFilters';
import { ExecutiveFilterBar } from '../components/ExecutiveFilterBar';
import { audienceTone } from '../lib/audience';
import { useFetch } from '../lib/hooks';
import { useAuthStore } from '../store/authStore';
import type { DailyPoint, ExecutiveDashboardResponse, ModuleStat, TrainerStat, ViewedModuleStat } from '../types';
import { Badge, ErrorState, PageHeader, Skeleton, cardClass, primaryButtonClass } from '../components/ui';
import { MotionItem, MotionList } from '../components/motion';

const fmt = new Intl.NumberFormat('id-ID');
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/* ── Scorecard ─────────────────────────────────────────────────────────────── */
function Scorecard({ label, value, hint, icon: Icon }: { label: string; value: string; hint: string; icon: LucideIcon }) {
  return (
    <div className={`${cardClass} card-interactive p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
        <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

/* ── Sparkline (single series, hover crosshair) ────────────────────────────── */
function Sparkline({ points }: { points: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 120;
  const PAD = 8;
  const max = Math.max(1, ...points.map((p) => p.sessions));
  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.sessions).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        role="img"
        aria-label="Sesi per hari, 28 hari terakhir"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((rel - PAD) / (W - PAD * 2)) * (points.length - 1));
          setHover(Math.min(points.length - 1, Math.max(0, idx)));
        }}
      >
        <path d={area} className="fill-brand-500/10" />
        <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-brand-500" />
        {hover !== null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} strokeWidth={1} className="stroke-slate-300 dark:stroke-slate-700" />
            <circle cx={x(hover)} cy={y(points[hover].sessions)} r={4} strokeWidth={2} className="fill-brand-500 stroke-white dark:stroke-slate-900" />
          </>
        )}
      </svg>
      {active && (
        <div
          className="pointer-events-none absolute -top-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900"
          style={{ left: `${(x(hover!) / W) * 100}%`, transform: `translateX(${hover! > points.length / 2 ? '-110%' : '10%'})` }}
        >
          <p className="font-medium">{fmtDate(active.date)}</p>
          <p className="text-slate-500 dark:text-slate-400">
            {active.sessions} sesi · {fmt.format(active.participants)} peserta
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Leaderboard ───────────────────────────────────────────────────────────── */
const RANK_STYLE: Record<number, string> = {
  1: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  2: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  3: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200',
};

function TrainerLeaderboard({ rows }: { rows: TrainerStat[] }) {
  const vocab = useVocab();
  const max = Math.max(1, ...rows.map((r) => r.report_count));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
            <th className="px-5 py-2.5 font-semibold">#</th>
            <th className="px-2 py-2.5 font-semibold">{vocab.trainer}</th>
            <th className="px-2 py-2.5 font-semibold">Sesi</th>
            <th className="px-2 py-2.5 text-right font-semibold">Peserta</th>
            <th className="px-5 py-2.5 text-right font-semibold">Disetujui</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((t) => (
            <tr key={t.trainer_id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-5 py-3">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${RANK_STYLE[t.rank] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {t.rank}
                </span>
              </td>
              <td className="px-2 py-3">
                <p className="font-medium">{t.trainer_name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.territory_name}</p>
              </td>
              <td className="w-44 px-2 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(t.report_count / max) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs tabular-nums">{t.report_count}</span>
                </div>
              </td>
              <td className="px-2 py-3 text-right tabular-nums">{fmt.format(t.participants)}</td>
              <td className="px-5 py-3 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {t.approved_count}/{t.report_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Top modules: horizontal bars, single hue, direct-labelled ─────────────── */
function TopModules({ rows }: { rows: ModuleStat[] }) {
  const max = Math.max(1, ...rows.map((r) => r.usage_count));
  return (
    <ul className="space-y-4 p-5">
      {rows.map((m) => (
        <li key={m.module_id} className="group">
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <Link to={`/modules/${m.module_id}`} className="min-w-0 truncate font-medium hover:text-brand-600 dark:hover:text-brand-400">
              <span className="mr-2 text-xs text-slate-400">{m.rank}</span>
              {m.title}
            </Link>
            <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {m.usage_count} sesi · {Math.round(m.share * 100)}%
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            title={`${m.title}: ${m.usage_count} sesi, ${fmt.format(m.participants)} peserta`}
          >
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-out group-hover:bg-brand-600 dark:group-hover:bg-brand-400"
              style={{ width: `${(m.usage_count / max) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{m.category} · {fmt.format(m.participants)} peserta · {fmt.format(m.views)} tayangan · {fmt.format(m.public_views)} publik</p>
        </li>
      ))}
    </ul>
  );
}

/* ── Most viewed modules (viewer count) ──────────────────────────────────── */
function ViewedModules({ rows }: { rows: ViewedModuleStat[] }) {
  const max = Math.max(1, ...rows.map((r) => r.views + r.public_views));
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map((m) => {
        const total = m.views + m.public_views;
        return (
          <li key={m.module_id} className="group px-5 py-3">
            <div className="flex items-center justify-between gap-3">
              <Link to={`/modules/${m.module_id}`} className="flex min-w-0 items-center gap-2 text-sm font-medium hover:text-brand-600 dark:hover:text-brand-400">
                <span className="w-4 shrink-0 text-xs text-slate-400">{m.rank}</span>
                <span className="truncate">{m.title}</span>
              </Link>
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums">
                <Eye className="h-3.5 w-3.5 text-slate-400" /> {fmt.format(total)}
              </span>
            </div>
            <div className="mt-1.5 ml-6 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-out" style={{ width: `${(total / max) * 100}%` }} />
            </div>
            <p className="mt-1 ml-6 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span className={`rounded px-1.5 py-px font-medium ${audienceTone(m.target_audience)}`}>{m.target_audience}</span>
              <span>{fmt.format(m.views)} internal</span>
              <span>·</span>
              <span>{fmt.format(m.public_views)} publik</span>
              <span>·</span>
              <span>{fmt.format(m.presentations)}x dipresentasikan</span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Official PDF export (auth + tenant headers travel through the axios instance) ── */
function DownloadReportButton({ query, onError }: { query: string; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get<Blob>(`/analytics/executive/report.pdf${query}`, { responseType: 'blob', timeout: 60_000 });
      saveBlob(res.data, filenameFrom(res, 'laporan-eksekutif.pdf'));
    } catch (err) {
      const msg = await blobErrorMessage(err, 'Gagal menyusun PDF.');
      if (mounted.current) onError(msg);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <button type="button" onClick={download} disabled={busy} className={`${primaryButtonClass} whitespace-nowrap`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {busy ? 'Menyusun PDF…' : 'Unduh Laporan Resmi (PDF)'}
    </button>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <Skeleton className="h-44 rounded-2xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

export function ExecutiveDashboard() {
  const vocab = useVocab();
  const user = useAuthStore((s) => s.user);
  const filters = useAnalyticsFilters();
  const { data, loading, error, refetch } = useFetch<ExecutiveDashboardResponse>(`/analytics/executive${filters.query}`);
  const [exportError, setExportError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Eksekutif"
        description={`Aktivitas lapangan sesuai cakupan Anda: ${data?.scope.label ?? user?.scope?.label ?? '…'}`}
        action={
          data && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Badge tone="brand">{user?.role_label}</Badge>
              <Link to="/reports" className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
                <Inbox className="h-4 w-4" /> {data.summary.pending_reviews} menunggu tinjauan
              </Link>
              <DownloadReportButton query={filters.query} onError={setExportError} />
            </div>
          )
        }
      />

      {exportError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <span>Gagal mengunduh laporan: {exportError}</span>
          <button type="button" onClick={() => setExportError(null)} className="text-xs font-medium underline">Tutup</button>
        </div>
      )}

      <ExecutiveFilterBar values={filters.values} onChange={filters.set} onClear={filters.clear} active={filters.active} />

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading || !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Scorecards */}
          <MotionList className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MotionItem><Scorecard label="Total Sesi" value={fmt.format(data.summary.total_sessions)} hint={`${data.summary.active_trainers} trainer aktif · ${data.summary.approval_rate}% disetujui`} icon={BarChart3} /></MotionItem>
            <MotionItem><Scorecard label="Audiens Terjangkau" value={fmt.format(data.summary.total_participants)} hint={`dari ${data.summary.modules_used} modul yang dipakai`} icon={Users} /></MotionItem>
            <MotionItem><Scorecard label="Rata-rata Peserta / Sesi" value={fmt.format(data.summary.avg_participants)} hint="peserta per sesi yang dilaporkan" icon={Clock} /></MotionItem>
            <MotionItem><Scorecard label="Total Tayangan Modul" value={fmt.format(data.summary.total_module_views)} hint="internal + publik, seluruh modul aktif" icon={Eye} /></MotionItem>
          </MotionList>

          {/* Trend */}
          <div className={`${cardClass} p-5`}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Sesi per hari</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{data.period.from} – {data.period.to} · arahkan kursor untuk detail</p>
              </div>
              <span className="text-xs text-slate-400">Diperbarui {new Date(data.generated_at).toLocaleTimeString()}</span>
            </div>
            <Sparkline points={data.trend} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Leaderboard */}
            <section className={cardClass}>
              <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                  <Award className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">{vocab.trainer} Paling Aktif</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Peringkat berdasarkan sesi yang dilaporkan</p>
                </div>
              </header>
              {data.top_trainers.length ? (
                <TrainerLeaderboard rows={data.top_trainers} />
              ) : (
                <p className="px-5 py-10 text-center text-xs text-slate-500">Belum ada sesi pada cakupan Anda.</p>
              )}
            </section>

            {/* Top modules */}
            <section className={cardClass}>
              <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Modul Paling Sering Dipresentasikan</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Porsi sesi pada cakupan Anda</p>
                </div>
              </header>
              {data.top_modules.length ? (
                <TopModules rows={data.top_modules} />
              ) : (
                <p className="px-5 py-10 text-center text-xs text-slate-500">Belum ada pemakaian modul pada cakupan Anda.</p>
              )}
            </section>

            {/* Viewer count */}
            <section className={`${cardClass} lg:col-span-2`}>
              <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <Eye className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Modul Paling Banyak Dilihat</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Jumlah viewer (internal + publik) per modul aktif</p>
                </div>
              </header>
              {data.top_viewed_modules.length ? (
                <ViewedModules rows={data.top_viewed_modules} />
              ) : (
                <p className="px-5 py-10 text-center text-xs text-slate-500">Belum ada modul yang disetujui / dilihat.</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
