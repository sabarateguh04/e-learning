import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, AtSign, BookOpen, Eye, EyeOff, Globe2, Layers, Loader2, Lock, MapPin, Moon, ShieldCheck, Sun } from 'lucide-react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';
import { CaptchaField } from '../components/CaptchaField';
import { motion } from 'framer-motion';
import { EASE_OUT } from '../lib/motionTokens';
import { useCaptcha } from '../lib/useCaptcha';
import { useAuthStore, selectIsAuthenticated, type User as AuthUser } from '../store/authStore';
import { homeFor } from '../lib/roles';
import { useTenantStore, type Tenant } from '../store/tenantStore';
import { useUIStore } from '../store/uiStore';
import { BRAND } from '../lib/brand';

interface LoginResponse {
  token: string;
  user: AuthUser;
  tenant: Tenant;
}

const HIGHLIGHTS = [
  { icon: ShieldCheck, title: 'Hak Akses 5 Tingkat', desc: 'Terisolasi per instansi, cakupan berjenjang', accent: 'text-sky-400' },
  { icon: Globe2, title: 'Nasional / Provinsi / Kota', desc: 'Analitik sesuai wilayah penugasan', accent: 'text-emerald-400' },
  { icon: BookOpen, title: 'Modul Pembelajaran', desc: 'Video, PDF & evaluasi', accent: 'text-violet-400' },
  { icon: MapPin, title: 'Laporan Lapangan', desc: 'Bukti sesi bergeotag GPS', accent: 'text-amber-400' },
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition-all ' +
  'focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 ' +
  'dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-brand-400';

export function Login() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setTenant = useTenantStore((s) => s.setTenant);
  const { theme, toggleTheme } = useUIStore();

  const [username, setUsername] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const captcha = useCaptcha();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLevel = useAuthStore((s) => s.user?.role_level);
  if (isAuthenticated) return <Navigate to={homeFor(roleLevel)} replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post<LoginResponse>('/auth/login', {
        username: username.trim(),
        password,
        captcha_id: captcha.id,
        captcha_answer: captchaAnswer.trim(),
      });

      setAuth(data.token, data.user);
      setTenant(data.tenant);
      navigate(data.user.must_change_password ? '/change-password' : homeFor(data.user.role_level), { replace: true });
    } catch (err) {
      const code = axios.isAxiosError<{ code?: string }>(err) ? err.response?.data?.code : undefined;
      // Captcha challenges are single-use: always fetch a fresh one after a failed attempt.
      captcha.reset();
      setCaptchaAnswer('');
      setError(
        code === 'ACCOUNT_PENDING'
          ? 'Pendaftaran Anda masih menunggu persetujuan administrator.'
          : code === 'ACCOUNT_REJECTED'
            ? 'Pendaftaran Anda ditolak. Silakan hubungi administrator.'
            : code === 'CAPTCHA_INVALID'
              ? 'Jawaban captcha salah atau sudah kedaluwarsa. Silakan coba lagi.'
              : getErrorMessage(err, 'Gagal masuk. Periksa kembali username dan password Anda.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
      {/* ── Left: brand panel ─────────────────────────────────────────── */}
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Grid texture + glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.06)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_60%,transparent_100%)]"
        />
        <div aria-hidden className="pointer-events-none absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-sky-400/10 blur-3xl" />

        <header className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-400 to-blue-600 shadow-lg shadow-sky-500/30">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">{BRAND.public.name}</p>
            <p className="text-[11px] text-sky-300/80">Portal pembelajaran & pemantauan lapangan</p>
          </div>
        </header>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 }} className="relative z-10 max-w-xl space-y-8">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-sky-200 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {BRAND.badge}
            </span>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight xl:text-5xl">
              {BRAND.public.tagline}
            </h1>
            <p className="max-w-md text-base leading-relaxed text-slate-300">{BRAND.intro}</p>
          </div>

          <ul className="grid grid-cols-2 gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, title, desc, accent }, i) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.25 + i * 0.07 }}
                whileHover={{ y: -3 }}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3.5 backdrop-blur transition-colors hover:bg-white/10"
              >
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${accent}`} />
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <footer className="relative z-10 text-xs text-slate-500">
          © {new Date().getFullYear()} {BRAND.public.name}. Hak cipta dilindungi.
        </footer>
      </section>

      {/* ── Right: form panel ─────────────────────────────────────────── */}
      <section className="relative flex items-center justify-center bg-white px-6 py-12 dark:bg-slate-950 sm:px-12">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Ganti tema"
          className="absolute right-6 top-6 rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <motion.div initial={{ opacity: 0, y: 16, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: EASE_OUT }} className="w-full max-w-sm space-y-8">
          {/* Mobile-only brand mark */}
          <div className="flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-400 to-blue-600 text-white">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{BRAND.public.name}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{BRAND.public.tagline}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Selamat datang kembali</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Masuk dengan username dan password Anda.</p>
          </div>

          {/* Public portal — visible above the fold, no account needed */}
          <Link
            to="/portal"
            className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-indigo-50 px-4 py-3 text-sm shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-sky-300 hover:shadow-[0_10px_30px_-12px_rgba(2,132,199,0.35)] dark:border-sky-900/50 dark:from-sky-950/40 dark:via-slate-900 dark:to-indigo-950/40 dark:hover:border-sky-800"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25"><BookOpen className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900 dark:text-white">Lihat Portal SINAU</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">Modul yang sudah disetujui — buka presentasi tanpa perlu masuk</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-sky-600 transition-transform group-hover:translate-x-0.5 dark:text-sky-400" />
          </Link>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {/* translate="no": credential labels must never be rewritten by browser auto-translate */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate translate="no">
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Username
              </label>
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nama.pengguna"
                  required
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
                  Lupa password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <CaptchaField captcha={captcha} value={captchaAnswer} onChange={setCaptchaAnswer} />

            <button
              type="submit"
              disabled={loading || !username.trim() || !password || (captcha.required && !captchaAnswer.trim())}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition-all hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-900/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:shadow-none dark:hover:bg-slate-200 dark:focus:ring-white/20"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memverifikasi…
                </>
              ) : (
                <>
                  Masuk
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Belum punya akun?{' '}
            <Link to="/register" className="font-medium text-brand-600 hover:underline dark:text-brand-400">Ajukan pendaftaran</Link>
          </p>


        </motion.div>
      </section>
    </div>
  );
}
