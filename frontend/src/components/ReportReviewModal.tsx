import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, ShieldCheck, X, XCircle } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import type { FieldReport } from '../types';
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui';

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Executive decision dialog for one field report. Approve needs no note;
 * reject requires a reason that the trainer will see on their report.
 */
export function ReportReviewModal({
  report,
  decision,
  isOverride,
  onClose,
  onDone,
}: {
  report: FieldReport;
  decision: 'approve' | 'reject';
  /** Super Admin acting instead of the direct supervisor */
  isOverride: boolean;
  onClose: () => void;
  onDone: (updated: FieldReport, message: string) => void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approve = decision === 'approve';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!approve && !note.trim()) {
      setError('Tuliskan alasan penolakan untuk trainer.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<{ message: string; data: FieldReport }>(`/reports/${report.id}/${decision}`, { note: note.trim() || undefined });
      onDone(data.data, data.message);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={approve ? 'Setujui laporan' : 'Tolak laporan'}>
      <div className="absolute inset-0 animate-fade-in" onClick={onClose} />
      <form onSubmit={submit} className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-up dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {approve ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-red-600" />}
            <h2 className="text-sm font-semibold">{approve ? 'Setujui laporan lapangan' : 'Tolak laporan lapangan'}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
            <dt className="text-slate-500 dark:text-slate-400">Kegiatan</dt><dd className="font-medium">{report.location_name}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Trainer</dt><dd>{report.trainer_name} · {report.territory_name}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Modul</dt><dd className="truncate">{report.module_title}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Tanggal</dt><dd>{report.report_date}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Audiens</dt><dd>{report.audience} · {report.participant_count} peserta</dd>
            <dt className="text-slate-500 dark:text-slate-400">Dikirim</dt><dd>{fmtDateTime(report.created_at)}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Wewenang</dt><dd>{report.approver_label}</dd>
          </dl>
          {report.notes && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{report.notes}</p>}

          {isOverride && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Anda bertindak sebagai Super Admin (override). Keputusan ini dicatat sebagai override, bukan persetujuan atasan langsung.
            </p>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{approve ? 'Catatan (opsional)' : 'Alasan penolakan'}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={`${inputClass} mt-1 resize-none`} placeholder={approve ? 'Mis. Kegiatan sesuai rencana' : 'Mis. Foto dokumentasi belum dilampirkan'} />
          </label>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButtonClass}>Batal</button>
          <button
            type="submit"
            disabled={saving}
            className={approve ? primaryButtonClass : 'inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60'}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : approve ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {approve ? 'Setujui (Approve)' : 'Tolak (Reject)'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
