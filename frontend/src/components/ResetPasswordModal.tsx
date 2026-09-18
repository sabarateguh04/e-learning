import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, ShieldAlert, Wand2, X } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import type { AdminUser, ApiValidationError } from '../types';
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui';

interface ResetResult {
  message: string;
  generated: boolean;
  must_change_password: boolean;
  temporary_password?: string;
}

/**
 * Super Admin: reset a user's password — either type a new one or let the server
 * generate a temporary one (shown exactly once). Optionally force a change at next login.
 */
export function ResetPasswordModal({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<'generate' | 'manual'>('generate');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [mustChange, setMustChange] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<ResetResult>(`/admin/users/${user.id}/reset-password`, {
        new_password: mode === 'manual' ? password : '',
        must_change_password: mustChange,
      });
      setResult(data);
      onDone(`${user.full_name}: ${data.message}${data.must_change_password ? ' — wajib ganti password saat login berikutnya' : ''}`);
    } catch (err) {
      const fieldErr = axios.isAxiosError<ApiValidationError>(err) ? err.response?.data?.errors?.new_password : undefined;
      setError(fieldErr ?? getErrorMessage(err, 'Gagal mereset password.'));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!result?.temporary_password) return;
    try {
      await navigator.clipboard.writeText(result.temporary_password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the value is still visible on screen */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Reset password ${user.full_name}`}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl border border-slate-200 bg-white shadow-2xl animate-fade-up dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"><KeyRound className="h-4 w-4" /></div>
            <div>
              <h2 className="text-sm font-semibold">Reset Password</h2>
              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">@{user.username} · {user.full_name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
        </div>

        {result ? (
          <div className="space-y-4 p-5">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{result.message}</p>
                {result.must_change_password && <p className="text-xs opacity-80">Pengguna wajib mengganti password saat login berikutnya.</p>}
              </div>
            </div>

            {result.temporary_password && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Password sementara</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 select-all rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-base tracking-wider dark:border-slate-800 dark:bg-slate-950">{result.temporary_password}</code>
                  <button type="button" onClick={copy} className={secondaryButtonClass} aria-label="Salin password">
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />} {copied ? 'Tersalin' : 'Salin'}
                  </button>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Ditampilkan sekali saja dan tidak disimpan dalam bentuk teks. Sampaikan ke pengguna melalui kanal yang aman.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={primaryButtonClass}>Selesai</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate translate="no">
            <fieldset disabled={saving} className="space-y-5 p-5">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['generate', 'Generate otomatis', 'Password sementara 12 karakter', Wand2],
                    ['manual', 'Masukkan manual', 'Ketik password baru sendiri', KeyRound],
                  ] as const
                ).map(([key, label, hint, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setMode(key); setError(null); }}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${mode === key ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'}`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className={`block text-[11px] ${mode === key ? 'opacity-70' : 'text-slate-500 dark:text-slate-400'}`}>{hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              {mode === 'manual' && (
                <div className="space-y-1.5">
                  <label htmlFor="rp_password" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Password baru</label>
                  <div className="relative">
                    <input id="rp_password" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} placeholder="minimal 8 karakter" className={`${inputClass} pr-11`} autoFocus />
                    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Sembunyikan' : 'Tampilkan'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900" />
                <span>
                  <span className="block text-sm font-medium">Wajibkan ganti password saat login berikutnya</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Pengguna hanya bisa mengakses halaman ganti password sampai password baru ditetapkan.</span>
                </span>
              </label>

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </fieldset>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
              <button type="button" onClick={onClose} disabled={saving} className={secondaryButtonClass}>Batal</button>
              <button type="submit" disabled={saving || (mode === 'manual' && password.length < 8)} className={primaryButtonClass}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} {mode === 'generate' ? 'Generate & reset' : 'Reset password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
