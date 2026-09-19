import { useVocab } from '../lib/vocab';
import { useState, type FormEvent, type ReactNode } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, Crosshair, GraduationCap, Loader2, MapPin, Send, Users } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { AUDIENCE_CATEGORIES, REPORT_PHOTO_MAX, REPORT_PHOTO_MIN, type ApiValidationError, type ModulesResponse, type SubmitReportPayload, type SubmitReportResponse } from '../types';
import { cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from './ui';
import { PhotoPicker } from './PhotoPicker';

const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const emptyForm = (): SubmitReportPayload => ({
  module_id: '',
  location_name: '',
  report_date: today(),
  audience: '',
  participant_count: '',
  latitude: null,
  longitude: null,
  photos: [],
  notes: '',
});

type GeoStatus = 'idle' | 'locating' | 'ready' | 'error';
const formatCoord = (n: number) => n.toFixed(6);

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

/**
 * "Lap Kegiatan" form: module, activity date, location + GPS fix, target audience,
 * participant count, 2-4 evidence photos, and notes. Submits to POST /api/reports.
 */
export function FieldReportForm({ canSubmit, onSubmitted }: { canSubmit: boolean; onSubmitted: (message: string) => void }) {
  const vocab = useVocab();
  const [form, setForm] = useState<SubmitReportPayload>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [geoMessage, setGeoMessage] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modules = useFetch<ModulesResponse>('/modules');
  const selectedModule = modules.data?.data.find((m) => m.id === form.module_id);

  const update = <K extends keyof SubmitReportPayload>(key: K, value: SubmitReportPayload[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => {
      if (!(key in e)) return e;
      const { [key]: _removed, ...rest } = e;
      return rest;
    });
  };

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setGeoStatus('error');
      setGeoMessage('Browser ini tidak mendukung geolokasi.');
      return;
    }
    setGeoStatus('locating');
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((f) => ({ ...f, latitude: coords.latitude, longitude: coords.longitude }));
        setAccuracy(coords.accuracy);
        setGeoStatus('ready');
        setFieldErrors(({ latitude: _a, longitude: _b, ...rest }) => rest);
      },
      (err) => {
        setGeoStatus('error');
        setGeoMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Izin lokasi ditolak. Aktifkan akses lokasi di pengaturan browser lalu coba lagi.'
            : err.code === err.TIMEOUT
              ? 'Waktu pencarian sinyal GPS habis. Pindah ke area terbuka dan coba lagi.'
              : 'Posisi tidak dapat ditentukan saat ini.',
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const reset = () => {
    setForm(emptyForm());
    setFieldErrors({});
    setGeoStatus('idle');
    setAccuracy(null);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: Record<string, string> = {};
    if (!form.module_id) errors.module_id = 'Pilih modul yang dipresentasikan';
    if (!form.location_name.trim()) errors.location_name = 'Nama lokasi/kegiatan wajib diisi';
    if (!form.report_date) errors.report_date = 'Pilih tanggal pelaksanaan';
    else if (form.report_date > today()) errors.report_date = 'Tanggal tidak boleh melebihi hari ini';
    if (!form.audience) errors.audience = 'Pilih target audiens';
    if (form.participant_count === '' || form.participant_count < 0) errors.participant_count = 'Isi jumlah peserta';
    if (form.latitude === null || form.longitude === null) errors.latitude = 'Ambil koordinat GPS sebelum mengirim';
    if (form.photos.length < REPORT_PHOTO_MIN || form.photos.length > REPORT_PHOTO_MAX) errors.photos = `Unggah ${REPORT_PHOTO_MIN} sampai ${REPORT_PHOTO_MAX} foto bukti kegiatan`;
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post<SubmitReportResponse>('/reports', { ...form, location_name: form.location_name.trim(), notes: form.notes.trim() }, { timeout: 60_000 });
      onSubmitted(`${data.message} (ref ${data.data.id.slice(0, 8)})`);
      reset();
    } catch (err) {
      if (axios.isAxiosError<ApiValidationError>(err) && err.response?.status === 422 && err.response.data.errors) {
        setFieldErrors(err.response.data.errors);
      }
      setError(getErrorMessage(err, 'Gagal mengirim lap kegiatan.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={cardClass}>
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold">Detail kegiatan</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Semua isian wajib kecuali uraian. Laporan diteruskan ke atasan langsung untuk persetujuan.</p>
      </div>

      <fieldset disabled={!canSubmit || submitting} className="space-y-5 p-5">
        {!canSubmit && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            Hanya {vocab.trainer} yang dapat mengirim {vocab.report.toLowerCase()}. Pimpinan meninjau laporan lewat{' '}
            <Link to="/reports" className="font-medium underline">Inbox Persetujuan Laporan</Link>.
          </p>
        )}

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{error}</p>}

        <Field
          label="Modul yang dipresentasikan"
          htmlFor="module_id"
          error={fieldErrors.module_id}
          hint={selectedModule ? `${selectedModule.category} · ${selectedModule.duration_minutes} mnt · jenjang ${selectedModule.target_audience}` : undefined}
        >
          <div className="relative">
            <BookOpen className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select id="module_id" value={form.module_id} onChange={(e) => update('module_id', e.target.value)} disabled={modules.loading} className={`${inputClass} pl-10`}>
              <option value="">{modules.loading ? 'Memuat modul…' : 'Pilih modul…'}</option>
              {modules.data?.data.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Nama kegiatan / lokasi" htmlFor="location_name" error={fieldErrors.location_name}>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="location_name" type="text" value={form.location_name} onChange={(e) => update('location_name', e.target.value)} placeholder="mis. Sosialisasi Tertib Lalu Lintas, SMAN 1 Depok" className={`${inputClass} pl-10`} />
            </div>
          </Field>

          <Field label="Tanggal laporan / pelaksanaan" htmlFor="report_date" error={fieldErrors.report_date}>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="report_date" type="date" value={form.report_date} max={today()} onChange={(e) => update('report_date', e.target.value)} className={`${inputClass} pl-10`} />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Target audiens" htmlFor="audience" error={fieldErrors.audience}>
            <div className="relative">
              <GraduationCap className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select id="audience" value={form.audience} onChange={(e) => update('audience', e.target.value as SubmitReportPayload['audience'])} className={`${inputClass} pl-10`}>
                <option value="">Pilih audiens…</option>
                {AUDIENCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </Field>

          <Field label="Jumlah peserta" htmlFor="participant_count" error={fieldErrors.participant_count}>
            <div className="relative">
              <Users className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="participant_count"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={form.participant_count}
                onChange={(e) => update('participant_count', e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))))}
                placeholder="0"
                className={`${inputClass} pl-10`}
              />
            </div>
          </Field>
        </div>

        {/* GPS */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Koordinat GPS</span>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {geoStatus === 'ready' && form.latitude !== null && form.longitude !== null ? (
                <>
                  <p className="font-mono text-sm text-slate-900 dark:text-white">{formatCoord(form.latitude)}, {formatCoord(form.longitude)}</p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Posisi terkunci{accuracy !== null ? ` · akurasi ±${Math.round(accuracy)} m` : ''}</p>
                </>
              ) : geoStatus === 'error' ? (
                <p className="text-xs text-red-600 dark:text-red-400">{geoMessage}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{geoStatus === 'locating' ? 'Mencari sinyal GPS…' : 'Koordinat belum diambil.'}</p>
              )}
            </div>
            <button type="button" onClick={locate} disabled={geoStatus === 'locating'} className={`${secondaryButtonClass} shrink-0`}>
              {geoStatus === 'locating' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
              {geoStatus === 'ready' ? 'Perbarui koordinat' : 'Ambil koordinat saat ini'}
            </button>
          </div>
          {(fieldErrors.latitude || fieldErrors.longitude) && <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.latitude ?? fieldErrors.longitude}</p>}
        </div>

        {/* Evidence photos */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Bukti kegiatan ({REPORT_PHOTO_MIN}–{REPORT_PHOTO_MAX} foto)</span>
          <PhotoPicker value={form.photos} onChange={(p) => update('photos', p)} min={REPORT_PHOTO_MIN} max={REPORT_PHOTO_MAX} disabled={!canSubmit || submitting} error={fieldErrors.photos} />
        </div>

        <Field label="Uraian kegiatan" htmlFor="notes" error={fieldErrors.notes}>
          <textarea id="notes" rows={4} value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Materi yang disampaikan, respons peserta, tindak lanjut…" className={`${inputClass} resize-y`} />
        </Field>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
          <button type="button" onClick={reset} className={secondaryButtonClass}>Reset</button>
          <button type="submit" className={primaryButtonClass}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? 'Mengirim…' : `Kirim ${vocab.submit_report}`}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
