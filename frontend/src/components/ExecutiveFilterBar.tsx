import { useMemo, type ReactNode } from 'react';
import { Building2, CalendarRange, ChevronRight, Lock, MapPin, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useFetch } from '../lib/hooks';
import type { AnalyticsFilterValues } from '../lib/useAnalyticsFilters';
import type { FilterOptionsResponse } from '../types';

const PRESETS: Array<{ label: string; days: number }> = [
  { label: '7 hari', days: 7 },
  { label: '28 hari', days: 28 },
  { label: '90 hari', days: 90 },
];
const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const todayIso = () => isoDaysAgo(1);

const control =
  'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow] ' +
  'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ' +
  'dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-900';

function Field({ icon: Icon, label, children, className = '' }: { icon: typeof MapPin; label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      {children}
    </label>
  );
}

/**
 * Hierarchical territory + period filter for executive analytics.
 * Options come from GET /api/analytics/filters, already bounded by the caller's role.
 * Locked dimensions (Provinsi for Kapolda, Provinsi + Kota for Kapolres) are shown once, as a
 * read-only territory badge — never as a dropdown — so the bar only offers what can actually change.
 */
export function ExecutiveFilterBar({
  values,
  onChange,
  onClear,
  active,
}: {
  values: AnalyticsFilterValues;
  onChange: (patch: Partial<AnalyticsFilterValues>) => void;
  onClear: () => void;
  active: number;
}) {
  const optionsUrl = useMemo(() => `/analytics/filters${values.provinsi_id ? `?provinsi_id=${values.provinsi_id}` : ''}`, [values.provinsi_id]);
  const { data } = useFetch<FilterOptionsResponse>(optionsUrl);
  const locked = data?.locked ?? { provinsi: false, kota: false };
  const lockedProvinsi = locked.provinsi ? (data?.names.provinsi ?? data?.provinsi[0]?.nama ?? null) : null;
  const lockedKota = locked.kota ? (data?.names.kota ?? data?.kota[0]?.nama ?? null) : null;
  const showProvinsi = !locked.provinsi;
  const showKota = !locked.kota;
  const kotaEnabled = locked.provinsi || Boolean(values.provinsi_id);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 print:hidden" aria-label="Filter wilayah dan periode">
      {/* Header row: title + locked territory badge + reset */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <SlidersHorizontal className="h-4 w-4" /> Filter
        </span>

        {(lockedProvinsi || lockedKota) && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            title="Wilayah penugasan Anda — terkunci sesuai peran"
          >
            <Lock className="h-3 w-3 text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400">Wilayah</span>
            <span className="inline-flex items-center gap-1">
              {lockedProvinsi && <span className="rounded-md bg-white px-1.5 py-0.5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">{lockedProvinsi}</span>}
              {lockedProvinsi && lockedKota && <ChevronRight className="h-3 w-3 text-slate-400" />}
              {lockedKota && <span className="rounded-md bg-white px-1.5 py-0.5 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">{lockedKota}</span>}
            </span>
          </span>
        )}

        {active > 0 && (
          <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
            <RotateCcw className="h-3.5 w-3.5" /> Reset filter
          </button>
        )}
      </div>

      {/* Controls: one symmetric row on desktop, 2 columns on tablet, stacked on mobile */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {showProvinsi && (
          <Field icon={MapPin} label="Provinsi">
            <select value={values.provinsi_id} onChange={(e) => onChange({ provinsi_id: e.target.value })} className={control}>
              <option value="">Seluruh Indonesia</option>
              {data?.provinsi.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </select>
          </Field>
        )}

        {showKota && (
          <Field icon={MapPin} label="Kota / Kabupaten">
            <select value={values.kota_id} onChange={(e) => onChange({ kota_id: e.target.value })} disabled={!kotaEnabled} className={control}>
              <option value="">{kotaEnabled ? 'Semua kota/kabupaten' : 'Pilih provinsi dahulu'}</option>
              {data?.kota.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
            </select>
          </Field>
        )}

        <Field icon={Building2} label="Satuan kerja">
          <select value={values.satker_id} onChange={(e) => onChange({ satker_id: e.target.value })} className={control}>
            <option value="">Semua satuan kerja</option>
            {data?.satker.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
          </select>
        </Field>

        <div className={`flex min-w-0 flex-col gap-1.5 ${showProvinsi && showKota ? '' : showKota ? 'sm:col-span-2 lg:col-span-2' : 'sm:col-span-1 lg:col-span-3'}`}>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <CalendarRange className="h-3.5 w-3.5" /> Periode
          </span>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={values.from} max={values.to || todayIso()} onChange={(e) => onChange({ from: e.target.value })} className={`${control} min-w-0 px-2`} aria-label="Dari tanggal" />
            <input type="date" value={values.to} min={values.from || undefined} max={todayIso()} onChange={(e) => onChange({ to: e.target.value })} className={`${control} min-w-0 px-2`} aria-label="Sampai tanggal" />
          </div>
        </div>
      </div>

      {/* Presets sit on their own row so nothing wraps or clips inside the grid cells */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <span className="text-[11px] font-medium text-slate-400">Periode cepat</span>
        {PRESETS.map((p) => {
          const on = values.from === isoDaysAgo(p.days) && values.to === todayIso();
          return (
            <button
              key={p.days}
              type="button"
              onClick={() => onChange({ from: isoDaysAgo(p.days), to: todayIso() })}
              className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
                on
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {p.label}
            </button>
          );
        })}
        {(values.from || values.to) && (
          <button type="button" onClick={() => onChange({ from: '', to: '' })} className="h-8 rounded-full px-3 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            Hapus periode
          </button>
        )}
      </div>
    </section>
  );
}
