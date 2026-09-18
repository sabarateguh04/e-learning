import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, ExternalLink, Images, Inbox, Search, ShieldCheck, XCircle } from 'lucide-react';
import { resolveAssetUrl } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { isSuperAdmin, isTrainer } from '../lib/roles';
import { useAuthStore } from '../store/authStore';
import type { FieldReport, ReportStatus, ReportsResponse } from '../types';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton, inputClass, primaryButtonClass } from '../components/ui';
import { DataTable } from '../components/DataTable';
import { ReportReviewModal } from '../components/ReportReviewModal';
import { ReportDetailModal } from '../components/ReportDetailModal';

const STATUS_FILTERS: Array<{ key: ReportStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'PENDING', label: 'Menunggu approval' },
  { key: 'APPROVED', label: 'Disetujui' },
  { key: 'REJECTED', label: 'Ditolak' },
];
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const mapsUrl = (r: FieldReport) => `https://www.google.com/maps?q=${r.latitude},${r.longitude}`;

/** Transparent approval state: who must approve, or who decided and through which path. */
function ApprovalStatus({ r }: { r: FieldReport }) {
  if (r.status === 'PENDING') {
    return (
      <div className="min-w-0">
        <Badge tone="warning">Menunggu Approval</Badge>
        <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{r.approver_label}</p>
      </div>
    );
  }
  const approved = r.status === 'APPROVED';
  return (
    <div className="min-w-0">
      <Badge tone={approved ? 'success' : 'danger'}>{approved ? 'Disetujui' : 'Ditolak'}</Badge>
      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
        {r.review_path === 'SUPER_ADMIN_OVERRIDE' && <ShieldCheck className="h-3 w-3 shrink-0 text-amber-500" aria-label="Override Super Admin" />}
        {r.reviewer_name ?? '—'}{r.reviewer_role_label ? ` · ${r.reviewer_role_label}` : ''}{r.reviewed_at ? ` · ${fmtDateTime(r.reviewed_at)}` : ''}
      </p>
      {r.review_note && <p className="mt-0.5 line-clamp-2 text-[11px] italic text-slate-500 dark:text-slate-400">“{r.review_note}”</p>}
    </div>
  );
}

export function ReportInbox() {
  const user = useAuthStore((s) => s.user);
  const trainerView = isTrainer(user?.role_level);
  const superAdmin = isSuperAdmin(user?.role_level);
  const { data, loading, error, refetch } = useFetch<ReportsResponse>('/reports');
  const [params] = useSearchParams();
  const requested = params.get('status');
  const highlight = params.get('highlight');
  const [status, setStatus] = useState<ReportStatus | 'ALL'>(requested && STATUS_FILTERS.some((s) => s.key === requested) ? (requested as ReportStatus) : 'ALL');
  const [query, setQuery] = useState('');
  const [review, setReview] = useState<{ report: FieldReport; decision: 'approve' | 'reject' } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Decisions made in this session overlay the fetched list until the next refetch.
  const [overrides, setOverrides] = useState<Record<string, FieldReport>>({});

  const all = useMemo(() => (data?.data ?? []).map((r) => overrides[r.id] ?? r), [data, overrides]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (r) =>
        (status === 'ALL' || r.status === status) &&
        (!q || `${r.location_name} ${r.trainer_name} ${r.module_title} ${r.territory_name}`.toLowerCase().includes(q)),
    );
  }, [all, status, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: all.length };
    for (const r of all) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [all]);
  const actionable = useMemo(() => all.filter((r) => r.can_review).length, [all]);
  // The action column always offers Detail; approve/reject appear only on rows the caller may decide.
  const detail = detailId ? all.find((r) => r.id === detailId) ?? null : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={trainerView ? 'Laporan Saya' : 'Inbox Persetujuan Laporan'}
        description={
          data
            ? trainerView
              ? `${data.total} laporan · setiap laporan disetujui oleh atasan langsung Anda`
              : `${data.total} laporan · ${data.scope.label}${actionable ? ` · ${actionable} menunggu keputusan Anda` : ''}`
            : 'Laporan lapangan dalam cakupan Anda.'
        }
        action={trainerView ? <Link to="/reports/new" className={primaryButtonClass}>Kirim laporan baru</Link> : undefined}
      />

      {!trainerView && (
        <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
          <span>
            Persetujuan berjenjang: laporan trainer diputuskan oleh <strong>pejabat satu tingkat di atasnya</strong> pada wilayah yang sama (Eksekutif Kota → Provinsi → Nasional).
            {superAdmin ? ' Sebagai Super Admin Anda memantau seluruh laporan; keputusan Anda dicatat sebagai override.' : ' Tombol Setujui/Tolak hanya muncul pada laporan yang menjadi wewenang Anda.'}
          </span>
        </p>
      )}

      {toast && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 animate-fade-in dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {toast}</span>
          <button type="button" onClick={() => setToast(null)} className="text-xs font-medium underline">Tutup</button>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatus(s.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                status === s.key
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700'
              }`}
            >
              {s.label}
              <span className="ml-1.5 tabular-nums opacity-60">{counts[s.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari lokasi, trainer, modul…" className={`${inputClass} pl-9`} />
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : loading && !data ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title="Tidak ada laporan" description="Tidak ada laporan yang cocok dengan filter pada cakupan Anda." />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          actionsHeader="Aksi"
          actions={(r) => (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDetailId(r.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Eye className="h-3.5 w-3.5" /> Detail
              </button>
              {r.can_review ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setReview({ report: r, decision: 'approve' })}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => setReview({ report: r, decision: 'reject' })}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Tolak
                      </button>
                    </>
              ) : !trainerView && r.status === 'PENDING' ? (
                <span className="hidden max-w-[160px] text-[11px] leading-snug text-slate-400 xl:block" title={r.review_block_reason ?? undefined}>
                  Wewenang {r.approver_label}
                </span>
              ) : null}
            </div>
          )}
          columns={[
            {
              key: 'session', header: 'Kegiatan', primary: true, className: 'min-w-[220px]',
              cell: (r) => (
                <div className={`flex items-start gap-3 ${r.id === highlight ? '-ml-2 border-l-2 border-brand-500 pl-2' : ''}`}>
                  <button type="button" onClick={() => setDetailId(r.id)} className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800" aria-label="Lihat detail">
                    {r.photo_urls[0] ? <img src={resolveAssetUrl(r.photo_urls[0])} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Images className="absolute inset-0 m-auto h-4 w-4 text-slate-400" />}
                    {r.photo_urls.length > 1 && <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[9px] text-white">{r.photo_urls.length}</span>}
                  </button>
                  <div className="min-w-0">
                    <button type="button" onClick={() => setDetailId(r.id)} className="block max-w-full truncate text-left font-medium hover:text-brand-600 dark:hover:text-brand-400">{r.location_name}</button>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmtDate(r.report_date)}</p>
                    <a href={mapsUrl(r)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400">
                      {(r.latitude ?? 0).toFixed(4)}, {(r.longitude ?? 0).toFixed(4)} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ),
            },
            ...(!trainerView
              ? [{ key: 'trainer', header: 'Trainer', cell: (r: FieldReport) => (<div><p>{r.trainer_name}</p><p className="text-[11px] text-slate-500 dark:text-slate-400">{r.territory_name}</p></div>) }]
              : []),
            { key: 'module', header: 'Modul', hideBelow: 'lg', className: 'max-w-[220px]', cell: (r) => <Link to={`/modules/${r.module_id}`} className="line-clamp-2 hover:text-brand-600 dark:hover:text-brand-400">{r.module_title}</Link> },
            { key: 'audience', header: 'Audiens', hideBelow: 'xl', cell: (r) => <span className="text-slate-600 dark:text-slate-300">{r.audience}</span> },
            { key: 'participants', header: 'Peserta', align: 'right', cell: (r) => <span className="tabular-nums">{r.participant_count}</span> },
            { key: 'status', header: 'Status persetujuan', className: 'min-w-[200px]', cell: (r) => <ApprovalStatus r={r} /> },
            { key: 'created', header: 'Dikirim', hideBelow: 'lg', align: 'right', cell: (r) => <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDateTime(r.created_at)}</span> },
          ]}
        />
      )}

      {detail && (
        <ReportDetailModal
          report={detail}
          onClose={() => setDetailId(null)}
          footer={
            detail.can_review ? (
              <>
                <button type="button" onClick={() => { setDetailId(null); setReview({ report: detail, decision: 'reject' }); }} className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/40">
                  <XCircle className="h-4 w-4" /> Tolak
                </button>
                <button type="button" onClick={() => { setDetailId(null); setReview({ report: detail, decision: 'approve' }); }} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Setujui
                </button>
              </>
            ) : undefined
          }
        />
      )}

      {review && (
        <ReportReviewModal
          report={review.report}
          decision={review.decision}
          isOverride={superAdmin}
          onClose={() => setReview(null)}
          onDone={(updated, message) => {
            setOverrides((o) => ({ ...o, [updated.id]: updated }));
            setToast(message);
            setReview(null);
          }}
        />
      )}
    </div>
  );
}
