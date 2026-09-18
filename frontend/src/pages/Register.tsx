import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, KeyRound, Layers, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { ROLE } from '../lib/roles';
import { BRAND } from '../lib/brand';
import { EMPTY_INSTANSI } from '../lib/forms';
import { useCaptcha } from '../lib/useCaptcha';
import type { ApiValidationError, RegisterOptions } from '../types';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';
import { InstansiSelects, WilayahSelects, type InstansiValue, type WilayahValue } from '../components/CascadingSelects';
import { CaptchaField } from '../components/CaptchaField';
import { StepTransition } from '../components/motion';

interface Account {
  username: string;
  employee_id: string;
  full_name: string;
  email: string;
  password: string;
  role_level: number;
}

const EMPTY: Account = { username: '', employee_id: '', full_name: '', email: '', password: '', role_level: ROLE.TRAINER };

const STEPS = [
  { key: 'account', label: 'Akun & Kredensial', icon: KeyRound },
  { key: 'mapping', label: 'Pemetaan Instansi', icon: Building2 },
  { key: 'confirm', label: 'Konfirmasi', icon: ShieldCheck },
] as const;
type StepKey = (typeof STEPS)[number]['key'];

const STEP_FIELDS: Record<StepKey, string[]> = {
  account: ['username', 'employee_id', 'full_name', 'email', 'password', 'role_level'],
  mapping: ['provinsi_id', 'kota_id', 'legacy_instansi_id', 'legacy_org_id', 'legacy_satker_id', 'legacy_sub_org_id'],
  confirm: ['captcha_answer', 'tenant_id'],
};

function Field({ label, htmlFor, error, hint, children, span = 1 }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode; span?: 1 | 2 }) {
  return (
    <div className={`space-y-1.5 ${span === 2 ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right font-medium">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

export function Register() {
  const options = useFetch<RegisterOptions>('/auth/register-options');
  const captcha = useCaptcha();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [account, setAccount] = useState<Account>(EMPTY);
  const [wilayah, setWilayah] = useState<WilayahValue>({ provinsi_id: '', kota_id: '' });
  const [instansi, setInstansi] = useState<InstansiValue>(EMPTY_INSTANSI);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const set = <K extends keyof Account>(key: K, value: Account[K]) => {
    setAccount((f) => ({ ...f, [key]: value }));
    setErrors((e) => { const { [key]: _r, ...rest } = e; return rest; });
  };
  const clearErrors = (keys: string[]) => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))));

  const needsProvince = account.role_level !== ROLE.EXEC_NATIONAL;
  const needsCity = account.role_level === ROLE.EXEC_CITY || account.role_level === ROLE.TRAINER;
  const roleLabel = options.data?.roles.find((r) => r.level === account.role_level)?.label ?? '';
  const legacyName = (list: keyof RegisterOptions['legacy'], id: string) => options.data?.legacy[list].find((o) => o.id === id)?.nama ?? id;
  const provinsiName = useMemo(() => options.data?.provinsi.find((p) => String(p.id) === wilayah.provinsi_id)?.nama, [options.data, wilayah.provinsi_id]);
  const kotaName = useMemo(() => options.data?.kota.find((k) => String(k.id) === wilayah.kota_id)?.nama, [options.data, wilayah.kota_id]);

  /** Client-side gate per step (the server re-validates everything on submit). */
  const validateStep = (i: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (i === 0) {
      if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(account.username)) e.username = 'Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, strip';
      if (!account.employee_id.trim()) e.employee_id = 'NIP wajib diisi';
      if (account.full_name.trim().length < 3) e.full_name = 'Nama lengkap minimal 3 karakter';
      if (account.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)) e.email = 'Format email tidak valid';
      if (account.password.length < 8) e.password = 'Password minimal 8 karakter';
    }
    if (i === 1) {
      if (needsProvince && !wilayah.provinsi_id) e.provinsi_id = 'Pilih provinsi';
      if (needsCity && !wilayah.kota_id) e.kota_id = 'Pilih kota';
      if (!instansi.legacy_instansi_id) e.legacy_instansi_id = 'Pilih instansi';
    }
    return e;
  };

  const goTo = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };
  const next = () => {
    const e = validateStep(step);
    if (Object.keys(e).length) {
      setErrors((prev) => ({ ...prev, ...e }));
      return;
    }
    goTo(step + 1);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    setSubmitting(true);
    try {
      const { data } = await api.post<{ message: string }>('/auth/register', {
        ...account,
        provinsi_id: needsProvince && wilayah.provinsi_id ? Number(wilayah.provinsi_id) : null,
        kota_id: needsCity && wilayah.kota_id ? Number(wilayah.kota_id) : null,
        ...instansi,
        captcha_id: captcha.id,
        captcha_answer: captchaAnswer.trim(),
      });
      setDone(data.message);
    } catch (err) {
      captcha.reset();
      setCaptchaAnswer('');
      if (axios.isAxiosError<ApiValidationError>(err) && err.response?.status === 422 && err.response.data.errors) {
        const errs = err.response.data.errors;
        setErrors(errs);
        // Jump back to the first step that carries a server-side error.
        const firstBad = STEPS.findIndex((s) => STEP_FIELDS[s.key].some((f) => f in errs));
        if (firstBad >= 0) goTo(firstBad);
        return;
      }
      setFailure(getErrorMessage(err, 'Pendaftaran gagal.'));
    } finally {
      setSubmitting(false);
    }
  };

  const stepHasError = (i: number) => STEP_FIELDS[STEPS[i].key].some((f) => f in errors);
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-4 dark:bg-slate-950 sm:px-6 sm:py-6">
      <div className="flex w-full max-w-lg flex-col gap-3 animate-fade-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-400 to-blue-600 text-white"><Layers className="h-4 w-4" /></div>
            <div>
              <p className="text-sm font-semibold leading-tight">{BRAND.public.name}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{BRAND.public.tagline}</p>
            </div>
          </div>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Masuk</Link>
        </div>

        {/* Card never exceeds the viewport: header + footer stay visible, only the step body scrolls. */}
        <div className="flex max-h-[calc(100dvh-5.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {done ? (
            <div className="flex flex-col items-center px-6 py-14 text-center animate-fade-up">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"><CheckCircle2 className="h-6 w-6" /></div>
              <p className="text-sm font-medium">Pendaftaran diterima</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{done}</p>
              <Link to="/login" className={`${primaryButtonClass} mt-6`}>Ke halaman masuk</Link>
            </div>
          ) : (
            <form onSubmit={submit} noValidate translate="no" className="flex min-h-0 flex-1 flex-col">
              {/* Header + progress (pinned) */}
              <div className="shrink-0 border-b border-slate-100 px-5 pb-3 pt-4 dark:border-slate-800">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h1 className="text-base font-bold tracking-tight">Pengajuan Akun</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Langkah {step + 1} dari {STEPS.length} · {STEPS[step].label}</p>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-slate-400">{Math.round(progress)}%</span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600 transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
                </div>
                <ol className="mt-2.5 grid grid-cols-3 gap-1.5">
                  {STEPS.map(({ key, label, icon: Icon }, i) => {
                    const state = i < step ? 'done' : i === step ? 'active' : 'todo';
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => i < step && goTo(i)}
                          disabled={i > step}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11px] font-medium transition-all duration-300 ease-out ${
                            state === 'active' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : state === 'done' ? 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800' : 'text-slate-400'
                          } ${stepHasError(i) && state !== 'active' ? 'ring-1 ring-red-400/60' : ''}`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${state === 'active' ? 'bg-white/20' : state === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800'}`}>
                            {state === 'done' ? <Check className="h-3 w-3" /> : i + 1}
                          </span>
                          <span className="hidden truncate sm:inline">{label}</span>
                          <Icon className="ml-auto hidden h-3.5 w-3.5 opacity-60 sm:block" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Step body — scrolls inside the card on short screens; the Lanjut/Ajukan button stays visible */}
              <fieldset disabled={submitting || options.loading} className="min-h-0 flex-1 overflow-y-auto p-5 scrollbar-thin">
                {failure && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{failure}</p>}
                <StepTransition stepKey={STEPS[step].key} direction={dir}>
                  {step === 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="Nama lengkap" htmlFor="full_name" error={errors.full_name} span={2}>
                        <input id="full_name" autoComplete="name" value={account.full_name} onChange={(e) => set('full_name', e.target.value)} className={inputClass} placeholder="Nama lengkap beserta gelar" autoFocus />
                      </Field>
                      <Field label="Username" htmlFor="username" error={errors.username} hint="Digunakan untuk masuk. 3–32 karakter.">
                        <input id="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={account.username} onChange={(e) => set('username', e.target.value.toLowerCase())} className={inputClass} placeholder="nama.pengguna" />
                      </Field>
                      <Field label="NIP / Employee ID" htmlFor="employee_id" error={errors.employee_id}>
                        <input id="employee_id" value={account.employee_id} onChange={(e) => set('employee_id', e.target.value)} className={inputClass} placeholder="198501012010011001" />
                      </Field>
                      <Field label="Email (opsional)" htmlFor="email" error={errors.email}>
                        <input id="email" type="email" autoComplete="email" value={account.email} onChange={(e) => set('email', e.target.value)} className={inputClass} placeholder="nama@instansi.go.id" />
                      </Field>
                      <Field label="Password" htmlFor="password" error={errors.password}>
                        <input id="password" type="password" autoComplete="new-password" value={account.password} onChange={(e) => set('password', e.target.value)} className={inputClass} placeholder="minimal 8 karakter" />
                      </Field>
                      <Field label="Peran" htmlFor="role_level" error={errors.role_level} span={2}>
                        <select id="role_level" value={account.role_level} onChange={(e) => { set('role_level', Number(e.target.value)); clearErrors(['provinsi_id', 'kota_id']); }} className={inputClass}>
                          {options.data?.roles.map((r) => <option key={r.level} value={r.level}>{r.label}</option>)}
                        </select>
                      </Field>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Wilayah penugasan</p></div>
                        <WilayahSelects value={wilayah} onChange={(v) => { setWilayah(v); clearErrors(['provinsi_id', 'kota_id']); }} errors={errors} needsProvince={needsProvince} needsCity={needsCity} />
                      </div>
                      <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pemetaan instansi (4 tingkat)</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">Instansi → Organisasi → Satuan Kerja → Sub Organisasi; setiap tingkat menyaring tingkat berikutnya.</p>
                        </div>
                        <InstansiSelects value={instansi} onChange={(v) => { setInstansi(v); clearErrors(['legacy_instansi_id', 'legacy_org_id', 'legacy_satker_id', 'legacy_sub_org_id']); }} errors={errors} />
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-4 dark:divide-slate-800 dark:border-slate-800">
                          <Summary label="Nama" value={account.full_name} />
                          <Summary label="Username" value={<span className="font-mono">@{account.username}</span>} />
                          <Summary label="NIP" value={<span className="font-mono">{account.employee_id}</span>} />
                          <Summary label="Email" value={account.email} />
                          <Summary label="Peran" value={roleLabel} />
                        </dl>
                        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-4 dark:divide-slate-800 dark:border-slate-800">
                          <Summary label="Provinsi" value={provinsiName} />
                          <Summary label="Kota" value={kotaName} />
                          <Summary label="Instansi" value={instansi.legacy_instansi_id && legacyName('instansi', instansi.legacy_instansi_id)} />
                          <Summary label="Organisasi" value={instansi.legacy_org_id && legacyName('organisasi', instansi.legacy_org_id)} />
                          <Summary label="Satuan Kerja" value={instansi.legacy_satker_id && legacyName('satker', instansi.legacy_satker_id)} />
                          <Summary label="Sub Organisasi" value={instansi.legacy_sub_org_id && legacyName('sub_org', instansi.legacy_sub_org_id)} />
                        </dl>
                      </div>
                      <CaptchaField captcha={captcha} value={captchaAnswer} onChange={(v) => { setCaptchaAnswer(v); clearErrors(['captcha_answer']); }} error={errors.captcha_answer} idPrefix="rg_" />
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Pendaftaran ditinjau oleh Super Admin sebelum akun dapat digunakan untuk masuk.</p>
                    </div>
                  )}
                </StepTransition>
              </fieldset>

              {/* Footer nav (pinned) */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
                <button type="button" onClick={() => goTo(step - 1)} disabled={step === 0 || submitting} className={secondaryButtonClass}><ArrowLeft className="h-4 w-4" /> Kembali</button>
                {step < STEPS.length - 1 ? (
                  <button type="button" onClick={next} disabled={options.loading} className={primaryButtonClass}>Lanjut <ArrowRight className="h-4 w-4" /></button>
                ) : (
                  <button type="submit" disabled={submitting || (captcha.required && !captchaAnswer.trim())} className={primaryButtonClass}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Ajukan pendaftaran
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
