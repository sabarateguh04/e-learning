import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Copy, KeyRound, Layers, LifeBuoy, Loader2, Mail, MailCheck, Phone, ShieldAlert } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { BRAND } from '../lib/brand';
import { useFetch } from '../lib/hooks';
import type { ApiValidationError } from '../types';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';
import { CaptchaField } from '../components/CaptchaField';
import { useCaptcha } from '../lib/useCaptcha';

interface Contact {
  email: string;
  phone: string | null;
}
interface ForgotSuccess {
  message: string;
  delivery: 'simulated' | 'smtp';
  masked_email: string;
  temporary_password?: string;
}
interface ForgotFailure extends ApiValidationError {
  code?: string;
  contact?: Contact;
}

function AdminContact({ contact, title }: { contact: Contact | null; title: string }) {
  if (!contact) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950 animate-fade-up">
      <p className="flex items-center gap-2 font-medium"><LifeBuoy className="h-4 w-4 text-brand-500" /> {title}</p>
      <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
        <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-brand-600 dark:hover:text-brand-400"><Mail className="h-3.5 w-3.5" /> {contact.email}</a>
        {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-2 hover:text-brand-600 dark:hover:text-brand-400"><Phone className="h-3.5 w-3.5" /> {contact.phone}</a>}
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const captcha = useCaptcha();
  const support = useFetch<{ contact: Contact }>('/auth/support');
  const [email, setEmail] = useState('');
  const [answer, setAnswer] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<{ message: string; contact: Contact | null } | null>(null);
  const [result, setResult] = useState<ForgotSuccess | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFailure(null);
    try {
      const { data } = await api.post<ForgotSuccess>('/auth/forgot-password', { email: email.trim(), captcha_id: captcha.id, captcha_answer: answer.trim() });
      setResult(data);
    } catch (err) {
      captcha.reset();
      setAnswer('');
      if (axios.isAxiosError<ForgotFailure>(err) && err.response) {
        const body = err.response.data;
        if (err.response.status === 422 && body.errors) {
          setErrors(body.errors);
          return;
        }
        setFailure({
          message:
            body.code === 'EMAIL_NOT_REGISTERED'
              ? 'Alamat email ini tidak terdaftar di platform.'
              : body.code === 'ACCOUNT_PENDING'
                ? 'Akun dengan email ini masih menunggu persetujuan administrator.'
                : body.code === 'FORGOT_THROTTLED'
                  ? 'Permintaan reset baru saja dikirim. Tunggu satu menit sebelum mencoba lagi.'
                  : getErrorMessage(err),
          contact: body.contact ?? support.data?.contact ?? null,
        });
        return;
      }
      setFailure({ message: getErrorMessage(err, 'Gagal memproses permintaan.'), contact: support.data?.contact ?? null });
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async () => {
    if (!result?.temporary_password) return;
    try {
      await navigator.clipboard.writeText(result.temporary_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* value remains visible */ }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6 animate-fade-up">
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

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"><KeyRound className="h-5 w-5" /></div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Lupa password</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Masukkan email terdaftar. Kami kirimkan password sementara.</p>
              </div>
            </div>
          </div>

          {result ? (
            <div className="space-y-4 p-6 animate-fade-up">
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Password sementara dikirim ke {result.masked_email}</p>
                  <p className="text-xs opacity-80">Masuk dengan password tersebut; Anda akan diminta membuat password baru.</p>
                </div>
              </div>

              {result.temporary_password && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Mode simulasi email (tanpa SMTP)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 select-all rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-base tracking-wider dark:border-slate-800 dark:bg-slate-950">{result.temporary_password}</code>
                    <button type="button" onClick={copy} className={secondaryButtonClass}>{copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />} {copied ? 'Tersalin' : 'Salin'}</button>
                  </div>
                  <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Ditampilkan di sini hanya karena pengiriman email disimulasikan di lingkungan pengembangan.</p>
                </div>
              )}

              <Link to="/login" className={`${primaryButtonClass} w-full`}>Ke halaman masuk</Link>
            </div>
          ) : (
            <form onSubmit={submit} noValidate translate="no">
              <fieldset disabled={submitting} className="space-y-5 p-6">
                {failure && (
                  <div className="space-y-3 animate-fade-up">
                    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{failure.message}</div>
                    <AdminContact contact={failure.contact} title="Butuh bantuan? Hubungi Administrator" />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="fp_email" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Email terdaftar</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input id="fp_email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrors({}); }} placeholder="nama@instansi.go.id" className={`${inputClass} pl-10`} autoFocus />
                  </div>
                  {errors.email && <p className="text-xs text-red-600 dark:text-red-400">{errors.email}</p>}
                </div>

                <CaptchaField captcha={captcha} value={answer} onChange={setAnswer} error={errors.captcha_answer} idPrefix="fp_" />
              </fieldset>
              <div className="border-t border-slate-100 px-6 py-4 dark:border-slate-800">
                <button type="submit" disabled={submitting || !email.trim() || (captcha.required && !answer.trim())} className={`${primaryButtonClass} w-full`}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Kirim password sementara
                </button>
              </div>
            </form>
          )}
        </div>

        {!result && !failure && <AdminContact contact={support.data?.contact ?? null} title="Tidak punya email terdaftar? Hubungi Administrator" />}
      </div>
    </div>
  );
}
