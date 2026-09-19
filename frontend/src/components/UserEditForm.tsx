import { useState, type FormEvent, type ReactNode } from 'react';
import axios from 'axios';
import { CheckCircle2, Loader2, Save, XCircle } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { ROLE, ROLE_LABEL, ROLE_ORDER, needsCity, type RoleLevel } from '../lib/roles';
import type { ApiValidationError } from '../types';
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui';
import { InstansiSelects, WilayahSelects, type InstansiValue, type WilayahValue } from './CascadingSelects';

/**
 * Shared Profile / Admin "Edit user" form with cascading wilayah + instansi dropdowns.
 *  - mode 'self'  -> PUT /auth/profile  (role read-only)
 *  - mode 'admin' -> PUT /admin/users/:id (role editable 0..4)
 */
export interface UserEditValues {
  full_name: string;
  email: string;
  role_level: RoleLevel;
  provinsi_id: string;
  kota_id: string;
  legacy_instansi_id: string;
  legacy_org_id: string;
  legacy_satker_id: string;
  legacy_sub_org_id: string;
}

export interface UserEditSubmitResult<T = unknown> {
  message: string;
  data: T;
  token?: string;
  user?: unknown;
}

function Field({ label, htmlFor, error, hint, children, span = 1 }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode; span?: 1 | 2 }) {
  return (
    <div className={`space-y-1.5 ${span === 2 ? 'md:col-span-2' : ''}`}>
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

const needsProvince = (role: number) => role !== ROLE.EXEC_NATIONAL && role !== ROLE.SUPER_ADMIN;

export function UserEditForm<T>({
  initial,
  mode,
  endpoint,
  onSaved,
  onCancel,
  isSelfAdmin = false,
  subtitle,
}: {
  initial: UserEditValues;
  mode: 'self' | 'admin';
  endpoint: string;
  onSaved: (result: UserEditSubmitResult<T>) => void;
  onCancel?: () => void;
  /** Admin editing their own account: role locked to Super Admin. */
  isSelfAdmin?: boolean;
  subtitle?: string;
}) {
  const [form, setForm] = useState<UserEditValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const clear = (keys: string[]) => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))));
  const setWilayah = (v: WilayahValue) => { setForm((f) => ({ ...f, ...v })); clear(['provinsi_id', 'kota_id']); };
  const setInstansi = (v: InstansiValue) => { setForm((f) => ({ ...f, ...v })); clear(['legacy_instansi_id', 'legacy_org_id', 'legacy_satker_id', 'legacy_sub_org_id']); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      const body: Record<string, unknown> = {
        full_name: form.full_name,
        email: form.email || null,
        provinsi_id: form.provinsi_id ? Number(form.provinsi_id) : null,
        kota_id: form.kota_id ? Number(form.kota_id) : null,
        legacy_instansi_id: form.legacy_instansi_id || null,
        legacy_org_id: form.legacy_org_id || null,
        legacy_satker_id: form.legacy_satker_id || null,
        legacy_sub_org_id: form.legacy_sub_org_id || null,
      };
      if (mode === 'admin') body.role_level = form.role_level;
      const { data } = await api.put<UserEditSubmitResult<T>>(endpoint, body);
      setToast({ tone: 'success', text: data.message });
      onSaved(data);
    } catch (err) {
      if (axios.isAxiosError<ApiValidationError>(err) && err.response?.status === 422 && err.response.data.errors) setErrors(err.response.data.errors);
      setToast({ tone: 'error', text: getErrorMessage(err, 'Failed to save.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {toast && (
        <div className={`mx-5 mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${toast.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'}`}>
          {toast.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}{toast.text}
        </div>
      )}
      {subtitle && <p className="px-5 pt-4 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}

      <fieldset disabled={saving} className="grid min-w-0 grid-cols-1 gap-5 p-5 md:grid-cols-2">
        <Field label="Full name" htmlFor="ue_full_name" error={errors.full_name}>
          <input id="ue_full_name" value={form.full_name} onChange={(e) => { setForm((f) => ({ ...f, full_name: e.target.value })); clear(['full_name']); }} className={inputClass} />
        </Field>
        <Field label="Email" htmlFor="ue_email" error={errors.email}>
          <input id="ue_email" type="email" value={form.email} onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); clear(['email']); }} className={inputClass} placeholder="nama@instansi.go.id" />
        </Field>

        <Field
          label="Role"
          htmlFor="ue_role"
          error={errors.role_level}
          hint={mode === 'self' ? 'Role changes are made by the Super Admin.' : isSelfAdmin ? 'You cannot demote your own account.' : 'Changing the role re-scopes what this user can see.'}
          span={2}
        >
          <select
            id="ue_role"
            value={form.role_level}
            disabled={mode === 'self' || isSelfAdmin}
            onChange={(e) => { setForm((f) => ({ ...f, role_level: Number(e.target.value) as RoleLevel })); clear(['role_level', 'provinsi_id', 'kota_id']); }}
            className={inputClass}
          >
            {ROLE_ORDER.map((level) => [String(level), ROLE_LABEL[level]] as const).map(([level, label]) => (
              <option key={level} value={level}>{level} — {label}</option>
            ))}
          </select>
        </Field>

        <div className="md:col-span-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Wilayah</p>
        </div>
        <WilayahSelects idPrefix="ue_" value={{ provinsi_id: form.provinsi_id, kota_id: form.kota_id }} onChange={setWilayah} errors={errors} needsProvince={needsProvince(form.role_level)} needsCity={needsCity(form.role_level)} />

        <div className="md:col-span-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pemetaan Instansi</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Instansi → Organisasi → Satuan Kerja → Sub Organisasi (each level filters the next).</p>
        </div>
        <InstansiSelects
          idPrefix="ue_"
          value={{ legacy_instansi_id: form.legacy_instansi_id, legacy_org_id: form.legacy_org_id, legacy_satker_id: form.legacy_satker_id, legacy_sub_org_id: form.legacy_sub_org_id }}
          onChange={setInstansi}
          errors={errors}
        />
      </fieldset>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={saving} className={secondaryButtonClass}>Cancel</button>
        ) : (
          <button type="button" onClick={() => { setForm(initial); setErrors({}); }} disabled={!dirty || saving} className={secondaryButtonClass}>Discard</button>
        )}
        <button type="submit" disabled={!dirty || saving} className={primaryButtonClass}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes</button>
      </div>
    </form>
  );
}
