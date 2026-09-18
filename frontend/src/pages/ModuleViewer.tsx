import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ClipboardCheck, Clock, FileText, Info, Maximize2, Minimize2, PlayCircle, User, X } from 'lucide-react';
import { api } from '../lib/api';
import { audienceTone } from '../lib/audience';
import { useFetch } from '../lib/hooks';
import type { LearningModule, ModuleResponse } from '../types';
import { LessonText } from '../components/LessonText';
import { VideoPlayer } from '../components/VideoPlayer';
import { splitIntoSlides } from '../lib/slides';

type Slide =
  | { kind: 'cover' }
  | { kind: 'video'; url: string }
  | { kind: 'text'; title: string | null; body: string }
  | { kind: 'materials' }
  | { kind: 'quiz' };

const buildSlides = (m: LearningModule): Slide[] => {
  const slides: Slide[] = [{ kind: 'cover' }];
  if (m.video_url) slides.push({ kind: 'video', url: m.video_url });
  if (m.content_text) for (const s of splitIntoSlides(m.content_text)) slides.push({ kind: 'text', ...s });
  if (m.pdf_url || m.attachments.length) slides.push({ kind: 'materials' });
  if (m.quiz) slides.push({ kind: 'quiz' });
  return slides;
};

/**
 * Fullscreen Presentation View — full viewport, no app chrome.
 * Keyboard: ← → / PageUp PageDown / Space (next), F (fullscreen), Esc (exit).
 */
export function ModuleViewer({ publicMode = false }: { publicMode?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  // Public visitors read the unauthenticated share endpoint (which counts the public view server-side).
  const { data, loading, error } = useFetch<ModuleResponse>(id ? (publicMode ? `/public/modules/${id}` : `/modules/${id}`) : null);
  const exitTo = publicMode ? '/portal' : `/modules/${id}`;
  const module = data?.data;
  const slides = useMemo(() => (module ? buildSlides(module) : []), [module]);

  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const total = slides.length;
  const go = useCallback((delta: number) => {
    setChromeVisible(true);
    setIndex((i) => Math.min(Math.max(i + delta, 0), Math.max(total - 1, 0)));
  }, [total]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    navigate(exitTo);
  }, [navigate, exitTo]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else rootRef.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  // Enter fullscreen on open (works when the navigation came from a user gesture; silently ignored otherwise).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || document.fullscreenElement) return;
    el.requestFullscreen?.().catch(() => undefined);
  }, []);

  // Track fullscreen state; count a view once.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    if (id && !publicMode) api.post(`/modules/${id}/view`).catch(() => undefined);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [id, publicMode]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(total - 1);
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
      else if (e.key === 'Escape' && !document.fullscreenElement) exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, total, toggleFullscreen, exit]);

  // Auto-hide chrome after inactivity (presentation feel); any pointer movement / navigation brings it back.
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChromeVisible(false), 3000);
  }, []);
  const poke = useCallback(() => {
    setChromeVisible(true);
    scheduleHide();
  }, [scheduleHide]);
  useEffect(() => {
    // Only arms the timer (state changes happen asynchronously inside it).
    scheduleHide();
    return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, [scheduleHide, index]);

  const slide = slides[index];
  const chrome = `transition-opacity duration-300 ${chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

  return (
    <div ref={rootRef} onMouseMove={poke} onTouchStart={poke} className="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-white select-none">
      {/* Top bar */}
      <header className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-slate-950/90 to-transparent px-4 py-3 sm:px-6 ${chrome}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs tabular-nums">{index + 1} / {total || '—'}</span>
          {module && (
            <>
              <span className="truncate text-sm font-medium text-slate-200">{module.title}</span>
              <span className={`hidden shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 sm:inline ${audienceTone(module.target_audience)}`}>{module.target_audience}</span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!publicMode && <Link to={`/modules/${id}`} className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white sm:inline-flex"><Info className="h-3.5 w-3.5" /> Detail</Link>}
          <button type="button" onClick={toggleFullscreen} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white" aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />} <span className="hidden sm:inline">{isFullscreen ? 'Normal' : 'Layar penuh'}</span>
          </button>
          <button type="button" onClick={exit} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-white/20 active:scale-95" aria-label="Keluar / Tutup Presentasi">
            <X className="h-3.5 w-3.5" /> Keluar
          </button>
        </div>
      </header>

      {/* Stage */}
      <main className="flex flex-1 items-center justify-center overflow-hidden px-6 py-16 sm:px-16">
        {error ? (
          <div className="text-center">
            <p className="text-lg font-semibold">Materi tidak dapat dimuat</p>
            <p className="mt-1 text-sm text-slate-400">{error}</p>
            <button type="button" onClick={exit} className="mt-6 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900">Kembali</button>
          </div>
        ) : loading || !module || !slide ? (
          <div className="h-2 w-40 animate-pulse rounded-full bg-white/20" />
        ) : (
          <div key={index} className="w-full max-w-5xl animate-fade-up">
            {slide.kind === 'cover' && (
              <div className="space-y-6 text-center">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${audienceTone(module.target_audience)}`}>Target audiens · {module.target_audience}</span>
                <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">{module.title}</h1>
                {module.description && <p className="mx-auto max-w-2xl text-lg text-slate-300 sm:text-xl">{module.description}</p>}
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
                  <span className="inline-flex items-center gap-1.5"><User className="h-4 w-4" /> {module.author_name ?? module.instructor_name}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {module.duration_minutes} menit</span>
                  <span>{module.category}</span>
                </div>
                <p className="text-xs text-slate-500">Tekan → atau spasi untuk mulai</p>
              </div>
            )}

            {slide.kind === 'video' && (
              <div className="mx-auto aspect-video w-full max-w-5xl overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
                <VideoPlayer url={slide.url} title={module.title} autoplay />
              </div>
            )}

            {slide.kind === 'text' && (
              <div className="mx-auto max-w-4xl">
                {slide.title && <h2 className="mb-6 text-3xl font-bold tracking-tight sm:text-5xl">{slide.title}</h2>}
                {slide.body ? <LessonText text={slide.body} size="lg" invert /> : null}
              </div>
            )}

            {slide.kind === 'materials' && (
              <div className="mx-auto max-w-2xl space-y-6">
                <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Materi pendukung</h2>
                <ul className="space-y-2">
                  {[...(module.pdf_url ? [{ id: 'primary', title: 'Catatan materi (PDF)', pdf_url: module.pdf_url }] : []), ...module.attachments].map((a) => (
                    <li key={a.id}>
                      <a href={a.pdf_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-lg transition-colors hover:bg-white/10">
                        <FileText className="h-5 w-5 text-red-400" /> {a.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {slide.kind === 'quiz' && module.quiz && (
              <div className="space-y-6 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10"><ClipboardCheck className="h-8 w-8" /></div>
                <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">Evaluasi</h2>
                <p className="text-lg text-slate-300">{module.quiz.questions.length} pertanyaan · {module.quiz.time_limit_minutes} menit · nilai lulus {module.quiz.pass_score}%</p>
                {publicMode ? (
                  <Link to="/login" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-slate-900 transition-transform hover:-translate-y-px active:scale-95">
                    <PlayCircle className="h-5 w-5" /> Masuk untuk mengerjakan evaluasi
                  </Link>
                ) : (
                  <Link to={`/modules/${id}?quiz=1`} onClick={() => document.fullscreenElement && document.exitFullscreen().catch(() => undefined)} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-slate-900 transition-transform hover:-translate-y-px active:scale-95">
                    <PlayCircle className="h-5 w-5" /> Mulai evaluasi
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom controls */}
      {total > 0 && (
        <footer className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-slate-950/90 to-transparent px-4 pb-4 pt-8 sm:px-6 ${chrome}`}>
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <button type="button" onClick={() => go(-1)} disabled={index === 0} className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 transition-all hover:bg-white/20 active:scale-95 disabled:opacity-30 sm:h-14 sm:w-14" aria-label="Sebelumnya">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="flex flex-1 items-center justify-center gap-1.5 overflow-hidden" role="tablist" aria-label="Slide">
              {slides.map((s, i) => (
                <button key={i} type="button" role="tab" aria-selected={i === index} aria-label={`Slide ${i + 1}`} onClick={() => setIndex(i)} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-8 bg-white' : 'w-2.5 bg-white/30 hover:bg-white/60'}`} title={s.kind} />
              ))}
            </div>
            <button type="button" onClick={() => go(1)} disabled={index >= total - 1} className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 transition-all hover:bg-white/20 active:scale-95 disabled:opacity-30 sm:h-14 sm:w-14" aria-label="Berikutnya">
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        </footer>
      )}

      {/* Large invisible tap zones for classroom/touch use */}
      <button type="button" onClick={() => go(-1)} className="absolute inset-y-24 left-0 z-10 w-1/5 cursor-w-resize opacity-0" aria-hidden tabIndex={-1} />
      <button type="button" onClick={() => go(1)} className="absolute inset-y-24 right-0 z-10 w-1/5 cursor-e-resize opacity-0" aria-hidden tabIndex={-1} />
    </div>
  );
}
