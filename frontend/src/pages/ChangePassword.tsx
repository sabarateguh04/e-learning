import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { BRAND } from '../lib/brand';
import { homeFor } from '../lib/roles';
import { useAuthStore, type User } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';
import type { ApiValidationError } from '../types';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';

/**
 * Forced password change after an admin reset (must_change_password) — also usable voluntarily.
 * Until a new password is set, the API refuses every other authenticated call.
 */
export function ChangePassword() {
  const navigate = useNavigate();
  const { user, setAuth, logout } = useAuthStore();
  const clearTenant = useTenantStore((s) => s.clearTenant);
  const forced = Boolean(user?.must_change_password);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    setErrors({});
    if (next !== confirm) {
      setErrors({ confirm: 'Konfirmasi password tidak sama' });
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<{ token: string; user: User }>('/auth/change-password', { current_password: current, new_password: next });
      setAuth(data.token, data.user); // token without the must_change_password claim
      navigate(homeFor(data.user.role_level), { replace: true });
    } catch (err) {
      if (axios.isAxiosError<ApiValidationError>(err) && err.response?.status === 422 && err.response.data.errors) setErrors(err.response.data.errors);
      setFailure(getErrorMessage(err, 'Gagal mengganti password.'));
    } finally {
      setSaving(false);
    }
  };

  const signOut = () => {
    logout();
    clearTenant();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6 animate-fade-up">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"><KeyRound className="h-6 w-6" /></div>
          <h1 className="text-xl font-bold tracking-tight">{forced ? 'Tetapkan password baru' : 'Ganti password'}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {forced ? 'Password akun Anda direset oleh administrator. Buat password baru untuk melanjutkan.' : `Perbarui password akun ${BRAND.public.name} Anda.`}
          </p>
          {user && <p className="mt-2 font-mono text-xs text-slate-400">@{user.username}</p>}
        </div>

        <form onSubmit={submit} noValidate translate="no" className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <fieldset disabled={saving} className="space-y-4 p-5">
            {failure && !Object.keys(errors).length && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{failure}</p>}

            {(
              [
                ['current', forced ? 'Password sementara' : 'Password saat ini', current, setCurrent, 'current-password', errors.current_password],
                ['next', 'Password baru', next, setNext, 'new-password', errors.new_password],
                ['confirm', 'Konfirmasi password baru', confirm, setConfirm, 'new-password', errors.confirm],
              ] as Array<[string, string, string, (v: string) => void, string, string | undefined]>
            ).map(([id, label, value, set, ac, error]) => (
              <div key={id} className="space-y-1.5">
                <label htmlFor={`cp_${id}`} className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</label>
                <input id={`cp_${id}`} type={show ? 'text' : 'password'} autoComplete={ac} value={value} onChange={(e) => set(e.target.value)} className={inputClass} placeholder={id === 'current' ? '••••••••' : 'minimal 8 karakter'} />
                {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
              </div>
            ))}

            <button type="button" onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {show ? 'Sembunyikan' : 'Tampilkan'} password
            </button>
          </fieldset>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
            <button type="button" onClick={signOut} className={secondaryButtonClass}><LogOut className="h-4 w-4" /> Keluar</button>
            <button type="submit" disabled={saving || !current || next.length < 8 || !confirm} className={primaryButtonClass}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Simpan password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
