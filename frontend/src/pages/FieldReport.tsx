import { useState } from 'react';
import { CheckCircle2, Eye, Navigation } from 'lucide-react';
import { resolveAssetUrl } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { isTrainer } from '../lib/roles';
import { useVocab } from '../lib/vocab';
import { useAuthStore } from '../store/authStore';
import type { FieldReport as FieldReportRecord, ReportsResponse } from '../types';
import { Badge, PageHeader, cardClass } from '../components/ui';
import { FieldReportForm } from '../components/FieldReportForm';
import { ReportDetailModal } from '../components/ReportDetailModal';

const statusTone = (s: FieldReportRecord['status']) => (s === 'APPROVED' ? 'success' : s === 'REJECTED' ? 'danger' : 'warning');
const statusLabel = (s: FieldReportRecord['status']) => (s === 'APPROVED' ? 'Disetujui' : s === 'REJECTED' ? 'Ditolak' : 'Menunggu');
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Lap Kegiatan": the submission form plus the trainer's recent submissions (click to open the detail modal). */
export function FieldReport() {
  const user = useAuthStore((s) => s.user);
  const canSubmit = isTrainer(user?.role_level);
  const vocab = useVocab();
  const [banner, setBanner] = useState<string | null>(null);
  const [detail, setDetail] = useState<FieldReportRecord | null>(null);
  const recent = useFetch<ReportsResponse>('/reports');

  return (
    <div className="space-y-6">
      <PageHeader
        title={vocab.submit_report}
        description={`Laporkan kegiatan lapangan: modul yang dipresentasikan, tanggal, audiens, posisi GPS, dan 2–4 foto bukti. Pelapor: ${user?.full_name ?? 'trainer'} · ${user?.territory_name ?? ''}.`}
      />

      {banner && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 animate-fade-in dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          <span className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {banner}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-xs font-medium underline">Tutup</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FieldReportForm
            canSubmit={canSubmit}
            onSubmitted={(msg) => {
              setBanner(msg);
              recent.refetch();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>

        <aside className={cardClass}>
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold">Lap kegiatan terbaru Anda</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{recent.data ? `${recent.data.total} laporan terkirim` : 'Memuat…'}</p>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.loading && !recent.data ? (
              <li className="px-4 py-6 text-center text-xs text-slate-500">Memuat…</li>
            ) : recent.error ? (
              <li className="px-4 py-6 text-center text-xs text-red-600 dark:text-red-400">{recent.error}</li>
            ) : (recent.data?.data.length ?? 0) === 0 ? (
              <li className="px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                <Navigation className="mx-auto mb-2 h-5 w-5 text-slate-400" />
                Belum ada laporan. Laporan pertama Anda akan muncul di sini.
              </li>
            ) : (
              recent.data!.data.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setDetail(r)} className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {r.photo_urls[0] ? (
                      <img src={resolveAssetUrl(r.photo_urls[0])} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><Eye className="h-4 w-4" /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{r.location_name}</span>
                        <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
                      </span>
                      <span className="block truncate text-[11px] text-slate-600 dark:text-slate-300">{r.module_title}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{fmtDate(r.report_date)} · {r.audience} · {r.participant_count} peserta</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>
      </div>

      {detail && <ReportDetailModal report={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
