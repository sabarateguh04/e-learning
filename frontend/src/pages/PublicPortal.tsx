import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Building2, Clock, Eye, Film, GraduationCap, Layers, LogIn, MonitorPlay, Moon, RefreshCw, Search, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useFetch } from '../lib/hooks';
import { AUDIENCE_META, TARGET_AUDIENCES, audienceTone, type TargetAudience } from '../lib/audience';
import { BRAND } from '../lib/brand';
import { EASE_OUT } from '../lib/motionTokens';
import { useUIStore } from '../store/uiStore';
import type { LearningModule } from '../types';
import { ModuleCover } from '../components/ModuleCover';

type PublicModule = LearningModule & { instansi_id: string | null; instansi_name: string | null };
interface PublicModulesResponse {
  success: boolean;
  total: number;
  instansi: Array<{ id: string; nama: string; modules: number }>;
  data: PublicModule[];
}

const fmt = new Intl.NumberFormat('id-ID');
const REFRESH_MS = 30_000;
type AudienceFilter = TargetAudience | 'ALL';
const viewsOf = (m: LearningModule) => m.metrics.views + m.metrics.public_views;

/* ── Card ────────────────────────────────────────────────────────────────── */
function ModuleCard({ m, index, reduce }: { m: PublicModule; index: number; reduce: boolean }) {
  const trainer = m.author_name ?? m.instructor_name;
  const instansi = m.instansi_name ?? m.tenant_name;
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay: Math.min(index, 9) * 0.04 }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-white/[0.04] dark:backdrop-blur-sm dark:hover:border-sky-400/30 dark:hover:bg-white/[0.06] dark:hover:shadow-[0_30px_80px_-30px_rgba(56,189,248,0.35)]"
    >
      {/* Media: thumbnail → YouTube poster → illustration, play badge for videos */}
      <Link to={`/portal/${m.id}/present`} className="relative block" aria-label={`Buka presentasi ${m.title}`}>
        <ModuleCover module={m} className="aspect-[16/10]">
          <span className={`absolute left-3 top-3 rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-sm ring-1 ${audienceTone(m.target_audience)}`}>{m.target_audience}</span>
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-slate-950/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            <Eye className="h-3 w-3" /> {fmt.format(viewsOf(m))}
          </span>
          {/* Origin institution — prominent, always on the media */}
          {instansi && (
            <span className="absolute bottom-3 left-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-lg border border-white/25 bg-slate-950/70 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur">
              <Building2 className="h-3.5 w-3.5 shrink-0 text-sky-300" />
              <span className="truncate">{instansi}</span>
            </span>
          )}
        </ModuleCover>
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-sky-700/80 dark:text-sky-300/80">{m.category}</p>
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">{m.title}</h3>
          {m.description && <p className="line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{m.description}</p>}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold uppercase text-slate-600 dark:bg-white/10 dark:text-slate-200">
            {trainer ? trainer.trim().charAt(0) : <UserRound className="h-3 w-3" />}
          </span>
          <span className="min-w-0 flex-1 truncate">{trainer || 'Trainer'}</span>
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums"><Clock className="h-3.5 w-3.5" />{m.duration_minutes} mnt</span>
          {m.video_url && <span className="inline-flex shrink-0 items-center gap-1"><Film className="h-3.5 w-3.5" />Video</span>}
        </div>

        <Link
          to={`/portal/${m.id}/present`}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-[background-color,transform] hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:shadow-[0_8px_24px_-8px_rgba(255,255,255,0.35)] dark:hover:bg-sky-50"
        >
          <MonitorPlay className="h-4 w-4" /> Presentasi layar penuh
        </Link>
      </div>
    </motion.li>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function PublicPortal() {
  const reduce = useReducedMotion() ?? false;
  const { theme, toggleTheme } = useUIStore();
  const [audience, setAudience] = useState<AudienceFilter>('ALL');
  const [instansiId, setInstansiId] = useState('');
  const [q, setQ] = useState('');

  // Server-side facets keep the catalogue accurate for any institution; search stays instant on the client.
  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (instansiId) p.set('instansi_id', instansiId);
    if (audience !== 'ALL') p.set('audience', audience);
    const s = p.toString();
    return `/public/modules${s ? `?${s}` : ''}`;
  }, [instansiId, audience]);
  const { data, loading, error, refetch } = useFetch<PublicModulesResponse>(url);
  const facets = useFetch<PublicModulesResponse>('/public/modules');

  useEffect(() => {
    const id = window.setInterval(refetch, REFRESH_MS);
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refetch]);

  const all = useMemo(() => facets.data?.data ?? [], [facets.data]);
  const instansiList = facets.data?.instansi ?? [];
  const modules = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.data ?? []).filter((m) => !needle || `${m.title} ${m.description} ${m.category} ${m.author_name ?? m.instructor_name} ${m.instansi_name ?? ''}`.toLowerCase().includes(needle));
  }, [data, q]);
  const counts = useMemo(() => {
    const scope = instansiId ? all.filter((m) => m.instansi_id === instansiId) : all;
    const c: Record<string, number> = { ALL: scope.length };
    for (const m of scope) c[m.target_audience] = (c[m.target_audience] ?? 0) + 1;
    return c;
  }, [all, instansiId]);
  const totalViews = useMemo(() => all.reduce((n, m) => n + viewsOf(m), 0), [all]);
  const featured = data?.data[0] ?? all[0];
  const activeInstansi = instansiList.find((i) => i.id === instansiId);

  const fade = (delay = 0) => ({ initial: reduce ? false : { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: EASE_OUT, delay } });

  return (
    <div className="relative min-h-dvh bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100" translate="no">
      {/* Ambient lighting (dark) / soft wash (light) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(56,189,248,0.16),transparent_60%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(30,64,175,0.45),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_100%_20%,rgba(99,102,241,0.10),transparent_60%)] dark:bg-[radial-gradient(ellipse_50%_40%_at_100%_20%,rgba(99,102,241,0.22),transparent_60%)]" />
        <div className="absolute inset-0 hidden bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] dark:block" />
      </div>

      {/* Top bar — neutral, shared platform */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/portal" className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-400 to-blue-600 text-white shadow-md shadow-sky-500/30"><Layers className="h-4 w-4" /></span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold tracking-tight">Portal Learning</span>
              <span className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block">Platform edukasi bersama · lintas instansi</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1.5">
            <a href="#katalog" className="hidden rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white sm:inline">Katalog</a>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-white"
              aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
              title={theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link to="/login" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white shadow-sm transition-[background-color,transform] hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:hover:bg-sky-50">
              <LogIn className="h-4 w-4" /> Masuk
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero — compact */}
      <section className="relative">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-8 pt-8 sm:px-6 sm:pt-10 lg:grid-cols-12 lg:items-center">
          <motion.div {...fade(0)} className="lg:col-span-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-600 backdrop-blur dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Terbuka untuk umum · {fmt.format(instansiList.length)} instansi berkontribusi
            </p>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-[1.08] tracking-[-0.02em] sm:text-5xl">
              Materi pelatihan resmi,
              <span className="block bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-sky-300 dark:via-blue-400 dark:to-indigo-300">dari berbagai instansi, untuk semua.</span>
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
              Modul yang telah disetujui masing-masing instansi, siap dipresentasikan di kelas atau dipelajari mandiri — pilih instansi dan jenjang audiens, lalu buka dalam mode presentasi layar penuh tanpa akun.
            </p>
            <dl className="mt-6 grid max-w-md grid-cols-3 divide-x divide-slate-200 dark:divide-white/10">
              {[
                { label: 'Modul publik', value: all.length },
                { label: 'Instansi', value: instansiList.length },
                { label: 'Total viewer', value: totalViews },
              ].map((s) => (
                <div key={s.label} className="px-4 first:pl-0">
                  <dd className="text-2xl font-semibold tabular-nums tracking-tight">{fmt.format(s.value)}</dd>
                  <dt className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{s.label}</dt>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div {...fade(0.1)} className="lg:col-span-5">
            {featured ? (
              <Link to={`/portal/${featured.id}/present`} className="group relative block overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)] transition-transform duration-500 hover:-translate-y-1 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_40px_100px_-40px_rgba(56,189,248,0.45)]">
                <ModuleCover module={featured} eager className="aspect-[16/10] rounded-xl">
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                  <span className={`absolute right-3 top-3 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${audienceTone(featured.target_audience)}`}>{featured.target_audience}</span>
                  <div className="absolute inset-x-4 bottom-4 text-white">
                    <p className="inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-slate-950/60 px-2 py-0.5 text-[11px] font-semibold backdrop-blur"><Building2 className="h-3 w-3 text-sky-300" /> {featured.instansi_name ?? featured.tenant_name ?? 'Instansi'}</p>
                    <p className="mt-2 line-clamp-2 text-lg font-semibold leading-snug tracking-tight">{featured.title}</p>
                    <p className="mt-1.5 flex items-center gap-3 text-xs text-white/80">
                      <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{fmt.format(viewsOf(featured))} viewer</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{featured.duration_minutes} mnt</span>
                      <span className="ml-auto inline-flex items-center gap-1 font-medium">Buka <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
                    </p>
                  </div>
                </ModuleCover>
              </Link>
            ) : (
              <div className="aspect-[16/10] rounded-2xl border border-slate-200 bg-white skeleton-shimmer dark:border-white/10 dark:bg-white/5" />
            )}
          </motion.div>
        </div>
      </section>

      {/* Catalogue */}
      <main id="katalog" className="relative mx-auto max-w-7xl scroll-mt-16 px-4 pb-16 sm:px-6">
        {/* Filter panel: institution + audience + search */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white/80 p-3 backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center">
            <label className="flex flex-col gap-1 md:col-span-4">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><Building2 className="h-3.5 w-3.5" /> Instansi asal</span>
              <select
                value={instansiId}
                onChange={(e) => setInstansiId(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-[border-color,box-shadow] focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 dark:border-white/10 dark:bg-slate-950/60 dark:text-white dark:focus:border-sky-400/60"
              >
                <option value="">Semua instansi ({fmt.format(all.length)})</option>
                {instansiList.map((i) => <option key={i.id} value={i.id}>{i.nama} ({i.modules})</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1 md:col-span-5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><GraduationCap className="h-3.5 w-3.5" /> Target audiens</span>
              <div className="-mx-1 overflow-x-auto px-1" role="tablist" aria-label="Target audiens">
                <div className="inline-flex min-w-full gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-slate-950/60 md:min-w-0">
                  {(['ALL', ...TARGET_AUDIENCES] as AudienceFilter[]).map((a) => {
                    const on = audience === a;
                    return (
                      <button key={a} type="button" role="tab" aria-selected={on} onClick={() => setAudience(a)} title={a === 'ALL' ? 'Semua jenjang' : AUDIENCE_META[a].description}
                        className={`relative flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${on ? 'text-white dark:text-slate-900' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
                        {on && <motion.span layoutId="audience-pill" transition={{ duration: reduce ? 0 : 0.25, ease: EASE_OUT }} className="absolute inset-0 rounded-md bg-slate-900 shadow-sm dark:bg-white" />}
                        <span className="relative">{a === 'ALL' ? 'Semua' : a}<span className={`ml-1 tabular-nums ${on ? 'opacity-70' : 'opacity-50'}`}>{counts[a] ?? 0}</span></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <label className="flex flex-col gap-1 md:col-span-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><Search className="h-3.5 w-3.5" /> Cari</span>
              <div className="flex items-center gap-2">
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Judul, kategori, trainer…"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-500/15 dark:border-white/10 dark:bg-slate-950/60 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-sky-400/60" />
                <button type="button" onClick={() => { refetch(); facets.refetch(); }} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:text-white" aria-label="Muat ulang katalog" title="Muat ulang">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </label>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{activeInstansi ? activeInstansi.nama : 'Semua instansi'}{audience !== 'ALL' ? ` · ${audience}` : ''}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">{fmt.format(modules.length)} modul{q ? ' cocok' : ''}</p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-10 text-center text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
            <div className="mt-3"><button type="button" onClick={refetch} className="text-xs font-medium underline">Coba lagi</button></div>
          </div>
        ) : loading && !data ? (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <li key={i} className="h-[360px] rounded-2xl border border-slate-200 bg-white skeleton-shimmer dark:border-white/10 dark:bg-white/5" />)}
          </ul>
        ) : modules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-16 text-center dark:border-white/15">
            <Search className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Belum ada modul yang cocok dengan filter ini.</p>
            <button type="button" onClick={() => { setQ(''); setAudience('ALL'); setInstansiId(''); }} className="mt-3 text-xs font-medium text-slate-700 underline dark:text-slate-200">Tampilkan semua modul</button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m, i) => <ModuleCard key={m.id} m={m} index={i} reduce={reduce} />)}
          </ul>
        )}
      </main>

      <footer className="relative border-t border-slate-200/70 bg-white/60 dark:border-white/10 dark:bg-slate-950/60">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center">
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-400 to-blue-600 text-white"><Layers className="h-3.5 w-3.5" /></span>
            <span><span className="font-medium text-slate-700 dark:text-slate-200">Portal Learning</span> · {BRAND.public.tagline} · © {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Hanya modul yang disetujui instansi masing-masing</span>
            <Link to="/login" className="inline-flex items-center gap-1 font-medium text-slate-700 hover:underline dark:text-slate-200">Masuk sebagai trainer / eksekutif <ArrowRight className="h-3 w-3" /></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
