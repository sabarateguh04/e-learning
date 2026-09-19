/**
 * Alesha AI — floating chat & voice assistant (DEMO / dummy engine).
 *
 * Mounted once in MainLayout (signed-in app) and PublicPortal. All "intelligence" lives
 * behind lib/alesha.ts (`askAlesha`, `listen`, `speak`) so the real-time pipeline can be
 * swapped in without touching this UI.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AudioLines, Bot, Loader2, MessageSquare, Mic, MicOff, RotateCcw, Send, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { ALESHA_NAME, ALESHA_STORAGE_KEY, askAlesha, hasBrowserSpeech, hasBrowserTts, listen, speak, type AleshaTurn, type Listener } from '../lib/alesha';
import { EASE_OUT } from '../lib/motionTokens';
import avatar from '../assets/alesha-avatar.png';

type Mode = 'chat' | 'voice';
type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Msg extends AleshaTurn { id: string; suggestions?: string[]; engine?: string }

const uid = () => Math.random().toString(36).slice(2, 10);
const WELCOME = (name?: string | null): Msg => ({
  id: 'welcome',
  role: 'assistant',
  content: `Halo${name ? `, ${name.split(' ')[0]}` : ''}! Saya ${ALESHA_NAME}, asisten SINAU. Tanyakan tentang materi, laporan lapangan, atau kuis — atau tekan ikon mikrofon untuk bicara.`,
  suggestions: ['Materi apa saja yang tersedia?', 'Bagaimana cara membuat laporan lapangan?', 'Apa itu SINAU?'],
});

const load = (): Msg[] => {
  try {
    const raw = sessionStorage.getItem(ALESHA_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Msg[]) : [];
  } catch {
    return [];
  }
};
const save = (msgs: Msg[]) => {
  try {
    sessionStorage.setItem(ALESHA_STORAGE_KEY, JSON.stringify(msgs.slice(-40)));
  } catch {
    /* storage unavailable — chat just won't persist */
  }
};

/** Renders **bold** and line breaks from the assistant's plain-text reply. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <span key={i} className="block min-h-[1em]">
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
          )}
        </span>
      ))}
    </>
  );
}

export function AleshaWidget() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const reduce = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('chat');
  const [messages, setMessages] = useState<Msg[]>(() => {
    const stored = load();
    return stored.length ? stored : [WELCOME(user?.full_name)];
  });
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [engine, setEngine] = useState<string>('dummy');

  // voice
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [ttsOn, setTtsOn] = useState(true);
  const listenerRef = useRef<Listener | null>(null);
  const stopSpeakRef = useRef<() => void>(() => undefined);
  const listenTarget = useRef<'input' | 'voice'>('voice');

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const context = useMemo(
    () => ({ page: location.pathname, user_name: user?.full_name ?? null, role_label: user?.role_label ?? null }),
    [location.pathname, user?.full_name, user?.role_label],
  );

  useEffect(() => save(messages), [messages]);
  useEffect(() => {
    if (open && mode === 'chat') {
      endRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      inputRef.current?.focus();
    }
  }, [messages, thinking, open, mode, reduce]);

  // stop mic / speech when the panel closes or unmounts
  useEffect(() => {
    if (open) return;
    listenerRef.current?.stop();
    stopSpeakRef.current();
    setVoiceState('idle');
  }, [open]);
  useEffect(() => () => { listenerRef.current?.stop(); stopSpeakRef.current(); }, []);

  const send = useCallback(
    async (text: string, viaVoice = false) => {
      const content = text.trim();
      if (!content || thinking) return;
      setInput('');
      const history = messages.filter((m) => m.id !== 'welcome').map(({ role, content: c }) => ({ role, content: c }));
      setMessages((prev) => [...prev, { id: uid(), role: 'user', content }]);
      setThinking(true);
      if (viaVoice) setVoiceState('thinking');
      const res = await askAlesha(content, history, context);
      setEngine(res.engine);
      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', content: res.reply, suggestions: res.suggestions, engine: res.engine }]);
      setThinking(false);
      if (viaVoice && ttsOn && hasBrowserTts()) {
        setVoiceState('speaking');
        stopSpeakRef.current = speak(res.reply, () => setVoiceState('idle'));
      } else if (viaVoice) {
        setVoiceState('idle');
      }
    },
    [messages, thinking, context, ttsOn],
  );

  const startListening = useCallback(
    (target: 'input' | 'voice') => {
      if (voiceState === 'listening') {
        listenerRef.current?.stop();
        return;
      }
      stopSpeakRef.current();
      listenTarget.current = target;
      setVoiceError(null);
      setTranscript('');
      setVoiceState('listening');
      listenerRef.current = listen({
        onInterim: (t) => setTranscript(t),
        onResult: (t) => {
          setTranscript(t);
          if (listenTarget.current === 'input') {
            setInput(t);
            setVoiceState('idle');
          } else {
            void send(t, true);
          }
        },
        onError: (msg) => {
          setVoiceError(msg);
          setVoiceState('idle');
        },
        onEnd: () => setVoiceState((s) => (s === 'listening' ? 'idle' : s)),
      });
    },
    [voiceState, send],
  );

  const reset = () => {
    listenerRef.current?.stop();
    stopSpeakRef.current();
    setMessages([WELCOME(user?.full_name)]);
    setTranscript('');
    setVoiceState('idle');
    setVoiceError(null);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const voiceLabel: Record<VoiceState, string> = {
    idle: 'Ketuk mikrofon lalu bicara',
    listening: 'Mendengarkan…',
    thinking: 'Alesha sedang berpikir…',
    speaking: 'Alesha menjawab…',
  };

  return (
    <>
      {/* ── Floating trigger ── */}
      <div className="group fixed bottom-5 right-5 z-40 flex items-center print:hidden">
        <div className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 translate-x-2 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100">
          <div className="whitespace-nowrap rounded-xl border border-indigo-400/30 bg-slate-900/95 px-3 py-2 text-xs text-white shadow-xl backdrop-blur">
            <p className="flex items-center gap-1.5 font-bold leading-none">
              {ALESHA_NAME}
              <span className="rounded border border-indigo-400/30 bg-indigo-500/30 px-1 py-0.5 text-[9px] font-semibold text-indigo-200">Virtual Assistant</span>
            </p>
            <p className="mt-1 text-[10px] text-indigo-200/70">Chat & interaksi suara · mode demo</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Tutup Alesha AI' : 'Buka Alesha AI'}
          aria-expanded={open}
          className="relative flex h-14 w-14 items-center justify-center rounded-full border border-indigo-300/40 bg-gradient-to-tr from-violet-600 via-indigo-600 to-blue-600 text-white shadow-2xl transition-transform duration-300 hover:scale-110 hover:shadow-indigo-500/40 active:scale-95"
        >
          {!open && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            </span>
          )}
          {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6 drop-shadow" />}
        </button>
      </div>

      {/* ── Panel ── */}
      <AnimatePresence>
        {open && (
          <motion.section
            key="alesha-panel"
            role="dialog"
            aria-label={ALESHA_NAME}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
            className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[600px] sm:max-h-[calc(100vh-7rem)] sm:w-[380px] sm:rounded-2xl sm:border sm:border-slate-200 dark:sm:border-slate-800 print:hidden"
          >
            {/* header */}
            <header className="flex items-center gap-3 border-b border-slate-200 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-3 text-white dark:border-slate-800">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90 ring-2 ring-white/60">
                <img src={avatar} alt="" className="h-9 w-9 object-contain object-top" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-bold leading-tight">
                  {ALESHA_NAME} <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                </p>
                <p className="flex items-center gap-1.5 text-[11px] text-indigo-100">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {engine === 'alesha' ? 'Terhubung ke engine Alesha' : 'Mode demo · jawaban contoh'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={reset} title="Mulai percakapan baru" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white">
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setOpen(false)} title="Tutup" className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white sm:hidden">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {/* mode switch */}
            <div className="grid grid-cols-2 gap-1 border-b border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-950/40">
              {(
                [
                  ['chat', 'Chat', MessageSquare],
                  ['voice', 'Suara', AudioLines],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mode === key ? 'bg-white text-indigo-700 shadow-sm dark:bg-slate-800 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {mode === 'chat' ? (
              <>
                {/* messages */}
                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {messages.map((m, idx) => {
                    const isLast = idx === messages.length - 1;
                    return (
                      <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] ${m.role === 'user' ? '' : 'flex items-end gap-2'}`}>
                          {m.role === 'assistant' && (
                            <span className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950">
                              <img src={avatar} alt="" className="h-6 w-6 object-contain object-top" />
                            </span>
                          )}
                          <div>
                            <div
                              className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                                m.role === 'user'
                                  ? 'rounded-br-md bg-indigo-600 text-white'
                                  : 'rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                              }`}
                            >
                              <RichText text={m.content} />
                            </div>
                            {m.role === 'assistant' && isLast && !thinking && m.suggestions?.length ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {m.suggestions.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => void send(s)}
                                    className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-50 dark:border-indigo-900 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {thinking && (
                    <div className="flex items-end gap-2">
                      <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950">
                        <img src={avatar} alt="" className="h-6 w-6 object-contain object-top" />
                      </span>
                      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-3 dark:bg-slate-800">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 120}ms` }} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>

                {/* composer */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(input);
                  }}
                  className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
                >
                  <button
                    type="button"
                    onClick={() => startListening('input')}
                    title={hasBrowserSpeech() ? 'Bicara untuk mengetik' : 'Mikrofon (simulasi — browser tidak mendukung Web Speech)'}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                      voiceState === 'listening' && listenTarget.current === 'input'
                        ? 'border-red-300 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400'
                        : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {voiceState === 'listening' && listenTarget.current === 'input' ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  <input
                    ref={inputRef}
                    value={voiceState === 'listening' && listenTarget.current === 'input' ? transcript || input : input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={voiceState === 'listening' && listenTarget.current === 'input' ? 'Mendengarkan…' : 'Tulis pertanyaan…'}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || thinking}
                    aria-label="Kirim"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </form>
              </>
            ) : (
              /* ── Voice mode ── */
              <div className="flex flex-1 flex-col items-center overflow-y-auto px-5 py-6 text-center">
                <div className="relative mt-2 flex h-40 w-40 items-center justify-center">
                  {(voiceState === 'listening' || voiceState === 'speaking') && !reduce && (
                    <>
                      <span className={`absolute inset-0 animate-ping rounded-full ${voiceState === 'listening' ? 'bg-red-400/30' : 'bg-indigo-400/30'}`} style={{ animationDuration: '1.6s' }} />
                      <span className={`absolute inset-4 animate-ping rounded-full ${voiceState === 'listening' ? 'bg-red-400/30' : 'bg-indigo-400/30'}`} style={{ animationDuration: '1.6s', animationDelay: '0.4s' }} />
                    </>
                  )}
                  <span className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-indigo-100 to-violet-100 ring-4 ring-white shadow-xl dark:from-indigo-950 dark:to-violet-950 dark:ring-slate-800">
                    <img src={avatar} alt="Alesha" className="h-28 w-28 object-contain object-top" />
                  </span>
                </div>

                <p className="mt-5 text-sm font-semibold text-slate-800 dark:text-slate-100">{voiceLabel[voiceState]}</p>
                <p className="mt-1 min-h-[2.5rem] px-2 text-sm text-slate-500 dark:text-slate-400">
                  {voiceState === 'listening' || voiceState === 'thinking' ? (transcript ? `“${transcript}”` : '…') : lastAssistant && lastAssistant.id !== 'welcome' ? <RichText text={lastAssistant.content} /> : 'Tanyakan tentang materi, laporan lapangan, atau kuis.'}
                </p>
                {voiceError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">{voiceError}</p>}
                {!hasBrowserSpeech() && (
                  <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">Browser ini tidak mendukung pengenalan suara — transkrip disimulasikan.</p>
                )}

                <div className="mt-auto flex w-full items-center justify-center gap-6 pt-6">
                  <button
                    type="button"
                    onClick={() => setTtsOn((v) => !v)}
                    title={ttsOn ? 'Matikan suara balasan' : 'Nyalakan suara balasan'}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    {ttsOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => startListening('voice')}
                    disabled={voiceState === 'thinking'}
                    aria-label={voiceState === 'listening' ? 'Berhenti mendengarkan' : 'Mulai bicara'}
                    className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-2xl transition-transform active:scale-95 disabled:opacity-50 ${
                      voiceState === 'listening' ? 'bg-red-500 hover:bg-red-400' : 'bg-gradient-to-tr from-violet-600 via-indigo-600 to-blue-600 hover:scale-105'
                    }`}
                  >
                    {voiceState === 'thinking' ? <Loader2 className="h-8 w-8 animate-spin" /> : voiceState === 'listening' ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { stopSpeakRef.current(); setVoiceState('idle'); }}
                    disabled={voiceState !== 'speaking'}
                    title="Hentikan suara"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="mt-4 text-[10px] uppercase tracking-wider text-slate-400">Mode demo · STT/TTS browser</p>
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
