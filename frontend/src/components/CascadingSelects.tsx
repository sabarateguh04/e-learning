import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useFetch } from '../lib/hooks';
import { inputClass } from './ui';

/**
 * Cascading / related dropdowns backed by GET /api/master/*.
 *
 * Contract: every child level is keyed on its parent's value. When a parent changes, the
 * component (1) clears every descendant value and (2) `useFetch` swaps to the new URL and
 * yields `data = null` until the new list arrives — so the old parent's children are never shown.
 */

interface Option {
  id: string | number;
  nama: string;
  unassigned?: boolean;
}
interface ListResp<T> {
  data: T[];
  /** cascade endpoints: the parent has no registered children; the list contains unassigned rows instead */
  fallback?: boolean;
}

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  loading,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  // A saved value that is not in the freshly loaded list stays visible (marked) instead of silently vanishing.
  const hasCurrent = !loading && value !== '' && !options.some((o) => String(o.id) === value);
  return (
    <div className="relative">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || loading} className={inputClass}>
        <option value="">{loading ? 'Loading…' : placeholder}</option>
        {hasCurrent && <option value={value}>{value} (current — not under selected parent)</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.nama}{o.unassigned ? ' (unassigned)' : ''}</option>
        ))}
      </select>
      {loading && <Loader2 className="pointer-events-none absolute right-8 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
    </div>
  );
}

/* ── Wilayah: provinsi -> kota ─────────────────────────────────────────────── */
export interface WilayahValue {
  provinsi_id: string;
  kota_id: string;
}

export function WilayahSelects({
  value,
  onChange,
  errors = {},
  needsProvince = true,
  needsCity = true,
  disabled,
  idPrefix = '',
}: {
  value: WilayahValue;
  onChange: (v: WilayahValue) => void;
  errors?: Record<string, string>;
  needsProvince?: boolean;
  needsCity?: boolean;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const provinsi = useFetch<ListResp<Option>>('/master/provinsi');
  const kota = useFetch<ListResp<Option>>(value.provinsi_id ? `/master/kota?provinsi_id=${encodeURIComponent(value.provinsi_id)}` : null);
  const kotaOptions = kota.data?.data ?? [];

  return (
    <>
      <Field label="Provinsi" htmlFor={`${idPrefix}provinsi_id`} error={errors.provinsi_id} hint={!needsProvince ? 'National scope — province optional' : undefined}>
        <Select
          id={`${idPrefix}provinsi_id`}
          value={value.provinsi_id}
          onChange={(provinsi_id) => onChange({ provinsi_id, kota_id: '' })}
          options={provinsi.data?.data ?? []}
          placeholder={needsProvince ? 'Select province…' : 'National'}
          disabled={disabled}
          loading={provinsi.loading}
        />
      </Field>
      <div key={`kota:${value.provinsi_id}`} className="animate-fade-in">
      <Field
        label="Kota"
        htmlFor={`${idPrefix}kota_id`}
        error={errors.kota_id}
        hint={!needsCity ? 'Optional for this role' : value.provinsi_id && kota.data && kotaOptions.length === 0 ? 'No city registered under this province yet' : undefined}
      >
        <Select
          id={`${idPrefix}kota_id`}
          value={value.kota_id}
          onChange={(kota_id) => onChange({ ...value, kota_id })}
          options={kotaOptions}
          placeholder={value.provinsi_id ? (needsCity ? 'Select city…' : 'Any city') : 'Choose a province first'}
          disabled={disabled || !value.provinsi_id}
          loading={Boolean(value.provinsi_id) && kota.loading}
        />
      </Field>
      </div>
    </>
  );
}

/* ── Instansi -> Organisasi -> Satuan Kerja -> Sub Organisasi ─────────────── */
export interface InstansiValue {
  legacy_instansi_id: string;
  legacy_org_id: string;
  legacy_satker_id: string;
  legacy_sub_org_id: string;
}

export type InstansiDepth = 'instansi' | 'organisasi' | 'satker' | 'sub_org';
const DEPTH_ORDER: InstansiDepth[] = ['instansi', 'organisasi', 'satker', 'sub_org'];

const LEVELS: Array<{
  key: Exclude<InstansiDepth, 'instansi'>;
  field: keyof InstansiValue;
  parentField: keyof InstansiValue;
  label: string;
  parentLabel: string;
  endpoint: (parent: string) => string;
  /** descendants cleared when this level changes */
  clears: Array<keyof InstansiValue>;
}> = [
  { key: 'organisasi', field: 'legacy_org_id', parentField: 'legacy_instansi_id', label: 'Organisasi', parentLabel: 'instansi', endpoint: (p) => `/master/organisasi?instansi_id=${encodeURIComponent(p)}`, clears: ['legacy_satker_id', 'legacy_sub_org_id'] },
  { key: 'satker', field: 'legacy_satker_id', parentField: 'legacy_org_id', label: 'Satuan Kerja', parentLabel: 'organisasi', endpoint: (p) => `/master/satker?org_id=${encodeURIComponent(p)}`, clears: ['legacy_sub_org_id'] },
  { key: 'sub_org', field: 'legacy_sub_org_id', parentField: 'legacy_satker_id', label: 'Sub Organisasi', parentLabel: 'satuan kerja', endpoint: (p) => `/master/sub-org?satker_id=${encodeURIComponent(p)}`, clears: [] },
];

export function InstansiSelects({
  value,
  onChange,
  errors = {},
  disabled,
  depth = 'sub_org',
  requireInstansi = true,
  idPrefix = '',
}: {
  value: InstansiValue;
  onChange: (v: InstansiValue) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  /** Deepest level to render (e.g. 'organisasi' shows instansi + organisasi only). */
  depth?: InstansiDepth;
  requireInstansi?: boolean;
  idPrefix?: string;
}) {
  const show = (lvl: InstansiDepth) => DEPTH_ORDER.indexOf(lvl) <= DEPTH_ORDER.indexOf(depth);
  const instansi = useFetch<ListResp<Option>>('/master/instansi');

  // Hooks are called unconditionally (fixed order); a level that is hidden or has no parent gets a null URL.
  const org = useFetch<ListResp<Option>>(show('organisasi') && value.legacy_instansi_id ? LEVELS[0].endpoint(value.legacy_instansi_id) : null);
  const satker = useFetch<ListResp<Option>>(show('satker') && value.legacy_org_id ? LEVELS[1].endpoint(value.legacy_org_id) : null);
  const subOrg = useFetch<ListResp<Option>>(show('sub_org') && value.legacy_satker_id ? LEVELS[2].endpoint(value.legacy_satker_id) : null);
  const fetches = [org, satker, subOrg];

  return (
    <>
      <Field label={`Instansi${requireInstansi ? '' : ' (optional)'}`} htmlFor={`${idPrefix}legacy_instansi_id`} error={errors.legacy_instansi_id}>
        <Select
          id={`${idPrefix}legacy_instansi_id`}
          value={value.legacy_instansi_id}
          onChange={(legacy_instansi_id) => onChange({ legacy_instansi_id, legacy_org_id: '', legacy_satker_id: '', legacy_sub_org_id: '' })}
          options={instansi.data?.data ?? []}
          placeholder="Select instansi…"
          disabled={disabled}
          loading={instansi.loading}
        />
      </Field>

      {LEVELS.map((level, i) => {
        if (!show(level.key)) return null;
        const fetch = fetches[i];
        const parent = value[level.parentField];
        const options = fetch.data?.data ?? [];
        const isLoading = Boolean(parent) && fetch.loading;
        const hint = !parent
          ? undefined
          : fetch.data?.fallback
            ? `No ${level.label.toLowerCase()} is registered under the selected ${level.parentLabel} yet — showing unassigned ${level.label.toLowerCase()} you can pick.`
            : fetch.data && options.length === 0
              ? `No ${level.label.toLowerCase()} available under the selected ${level.parentLabel}.`
              : undefined;
        return (
          // key includes the parent value so the field re-enters (fade) whenever its options are reloaded
          <div key={`${level.key}:${parent}`} className="animate-fade-in">
          <Field label={`${level.label} (optional)`} htmlFor={`${idPrefix}${level.field}`} error={errors[level.field]} hint={hint}>
            <Select
              id={`${idPrefix}${level.field}`}
              value={value[level.field]}
              onChange={(next) => onChange({ ...value, [level.field]: next, ...Object.fromEntries(level.clears.map((k) => [k, ''])) })}
              options={options}
              placeholder={parent ? '—' : `Choose ${level.parentLabel === 'instansi' ? 'an' : 'a'} ${level.parentLabel} first`}
              disabled={disabled || !parent}
              loading={isLoading}
            />
          </Field>
          </div>
        );
      })}
    </>
  );
}
