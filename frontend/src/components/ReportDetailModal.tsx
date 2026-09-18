import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, GraduationCap, ImageOff, MapPin, ShieldCheck, User, Users, X, XCircle } from 'lucide-react';
import { resolveAssetUrl } from '../lib/api';
import type { FieldReport } from '../types';
import { Badge } from './ui';

const fmtDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Row({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

/** Approval trail: submitted → (awaiting | decided by) direct supervisor one level above the trainer. */
function ApprovalTimeline({ r }: { r: FieldReport }) {
  const decided = r.status !== 'PENDING';
  const approved = r.status === 'APPROVED';
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-slate-700">
      <li>
        <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-white dark:ring-slate-900" />
        <p className="text-sm font-medium">Laporan dikirim</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{r.trainer_name} · {fmtDateTime(r.created_at)}</p>
      </li>
      <li>
        <span className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full ring-4 ring-white dark:ring-slate-900 ${!decided ? 'bg-amber-400' : approved ? 'bg-emerald-500' : 'bg-red-500'}`} />
        {!decided ? (
          <>
            <p className="text-sm font-medium">Menunggu approval atasan langsung</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Wewenang: {r.approver_label} (1 tingkat di atas trainer)</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {approved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              {approved ? 'Disetujui' : 'Ditolak'}
              {r.review_path === 'SUPER_ADMIN_OVERRIDE' && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"><ShieldCheck className="h-3 w-3" /> override Super Admin</span>
              )}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {r.reviewer_name ?? '—'}{r.reviewer_role_label ? ` · ${r.reviewer_role_label}` : ''}{r.reviewed_at ? ` · ${fmtDateTime(r.reviewed_at)}` : ''}
            </p>
            {r.review_note && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">“{r.review_note}”</p>}
          </>
        )}
      </li>
    </ol>
  );
}

/** Photo gallery with a simple lightbox (arrow keys / buttons to navigate). */
function Gallery({ urls }: { urls: string[] }) {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
      if (e.key === 'ArrowRight') setActive((i) => (i === null ? null : (i + 1) % urls.length));
      if (e.key === 'ArrowLeft') setActive((i) => (i === null ? null : (i - 1 + urls.length) % urls.length));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, urls.length]);

  if (!urls.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <ImageOff className="h-4 w-4" /> Tidak ada foto bukti pada laporan ini.
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {urls.map((u, i) => (
          <button key={u} type="button" onClick={() => setActive(i)} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800" aria-label={`Perbesar foto ${i + 1}`}>
            <img src={resolveAssetUrl(u)} alt={`Foto bukti ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-px text-[10px] text-white">{i + 1}/{urls.length}</span>
          </button>
        ))}
      </div>
      {active !== null && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label={`Foto ${active + 1} dari ${urls.length}`} onClick={() => setActive(null)}>
          <img src={resolveAssetUrl(urls[active])} alt={`Foto bukti ${active + 1}`} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setActive(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Tutup"><X className="h-5 w-5" /></button>
          {urls.length > 1 && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); setActive((active - 1 + urls.length) % urls.length); }} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Sebelumnya"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setActive((active + 1) % urls.length); }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Berikutnya"><ChevronRight className="h-5 w-5" /></button>
            </>
          )}
          <span className="absolute bottom-4 rounded-full bg-white/10 px-3 py-1 text-xs text-white">{active + 1} / {urls.length}</span>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Full "Lap Giat" detail: trainer & instansi, date, audience, notes, GPS, evidence gallery, approval trail. */
export function ReportDetailModal({ report: r, onClose, footer }: { report: FieldReport; onClose: () => void; footer?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const statusTone = r.status === 'APPROVED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning';
  const statusLabel = r.status === 'APPROVED' ? 'Disetujui' : r.status === 'REJECTED' ? 'Ditolak' : 'Menunggu Approval';

  // Rendered into <body> via a portal: the page shell animates with CSS transforms, which would
  // otherwise turn `position: fixed` into "relative to the transformed ancestor" and clip the modal.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`Detail lap kegiatan ${r.location_name}`}>
      <div className="absolute inset-0 animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-up dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Detail Lap Kegiatan</p>
            <h2 className="truncate text-base font-semibold">{r.location_name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Badge tone={statusTone}>{statusLabel}</Badge>
              <span>ref {r.id.slice(0, 8)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-5 py-4">
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <Row icon={User} label="Trainer"><span className="font-medium">{r.trainer_name}</span></Row>
              <Row icon={Building2} label="Instansi / wilayah">{r.territory_name}{r.provinsi_name && r.kota_name ? ` · ${r.provinsi_name}` : ''}</Row>
              <Row icon={CalendarDays} label="Tanggal pelaksanaan">{fmtDate(r.report_date)}</Row>
              <Row icon={Clock} label="Dikirim">{fmtDateTime(r.created_at)}</Row>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <Row icon={GraduationCap} label="Target audiens">{r.audience}</Row>
              <Row icon={Users} label="Jumlah peserta"><span className="tabular-nums">{r.participant_count} orang</span></Row>
              <Row icon={MapPin} label="Lokasi GPS">
                {r.latitude !== null && r.longitude !== null ? (
                  <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-brand-600 hover:underline dark:text-brand-400">
                    {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)} <ExternalLink className="h-3 w-3" />
                  </a>
                ) : '—'}
              </Row>
              <Row icon={ExternalLink} label="Modul"><Link to={`/modules/${r.module_id}`} className="text-brand-600 hover:underline dark:text-brand-400">{r.module_title}</Link></Row>
            </div>
          </div>

          <section className="mt-4">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Uraian kegiatan</h3>
            <p className="whitespace-pre-line rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">{r.notes?.trim() || <span className="text-slate-400">Tidak ada uraian.</span>}</p>
          </section>

          <section className="mt-4">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Bukti kegiatan ({r.photo_urls.length} foto)</h3>
            <Gallery urls={r.photo_urls} />
          </section>

          <section className="mt-5">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Status persetujuan berjenjang</h3>
            <ApprovalTimeline r={r} />
          </section>
        </div>

        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
