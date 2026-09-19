/**
 * Alesha AI client — chat + voice helpers used by components/AleshaWidget.tsx.
 *
 * Chat goes through the backend (POST /api/alesha/chat), which currently answers with a
 * DUMMY engine (backend/src/services/aleshaEngine.ts). Voice is done in the browser:
 * speech-to-text via the Web Speech API when available (Chrome/Edge), otherwise a simulated
 * transcript; text-to-speech via `speechSynthesis`.
 *
 * TODO(realtime): swap `askAlesha` for a streaming (SSE/WebSocket) call and replace the
 * browser STT/TTS with the real Alesha voice pipeline — the widget only depends on the
 * small interfaces below, so nothing else needs to change.
 */
import { api } from './api';

export interface AleshaTurn { role: 'user' | 'assistant'; content: string }
export interface AleshaContext { page?: string; user_name?: string | null; role_label?: string | null; module_title?: string | null }
export interface AleshaReply { reply: string; suggestions: string[]; engine: 'dummy' | 'alesha'; latency_ms: number }

export const ALESHA_NAME = 'Alesha AI';
export const ALESHA_STORAGE_KEY = 'sinau.alesha.chat';

const OFFLINE_REPLY = 'Maaf, Alesha sedang tidak terhubung ke server. Coba lagi beberapa saat lagi.';

export async function askAlesha(message: string, history: AleshaTurn[], context: AleshaContext): Promise<AleshaReply> {
  try {
    const { data } = await api.post<{ success: boolean; data: AleshaReply }>('/alesha/chat', { message, history: history.slice(-20), context });
    return data.data;
  } catch {
    return { reply: OFFLINE_REPLY, suggestions: [], engine: 'dummy', latency_ms: 0 };
  }
}

export async function aleshaStatus(): Promise<{ engine: string; voice: string; ready: boolean } | null> {
  try {
    const { data } = await api.get<{ success: boolean; data: { engine: string; voice: string; ready: boolean } }>('/alesha/status');
    return data.data;
  } catch {
    return null;
  }
}

/* ── Voice: speech-to-text ──────────────────────────────────────────────── */

/** Minimal typing for the (still vendor-prefixed) Web Speech API. */
interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

const speechCtor = (): SpeechRecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const hasBrowserSpeech = () => typeof window !== 'undefined' && speechCtor() !== null;

const SIMULATED_TRANSCRIPTS = ['Materi apa saja yang tersedia?', 'Bagaimana cara membuat laporan lapangan?', 'Apa itu SINAU?', 'Cara mengerjakan kuis'];

export interface Listener { stop: () => void }

/**
 * Starts listening and resolves the transcript through `onResult` (interim text through
 * `onInterim`). Falls back to a simulated transcript when the browser has no speech API.
 */
export function listen(handlers: { onInterim?: (text: string) => void; onResult: (text: string) => void; onError?: (msg: string) => void; onEnd?: () => void }): Listener {
  const Ctor = speechCtor();
  if (!Ctor) {
    // TODO(realtime): stream microphone audio to the Alesha STT service instead of simulating.
    const sample = SIMULATED_TRANSCRIPTS[Math.floor(Math.random() * SIMULATED_TRANSCRIPTS.length)];
    let i = 0;
    const words = sample.split(' ');
    const tick = window.setInterval(() => {
      i++;
      handlers.onInterim?.(words.slice(0, i).join(' '));
      if (i >= words.length) {
        window.clearInterval(tick);
        handlers.onResult(sample);
        handlers.onEnd?.();
      }
    }, 220);
    return { stop: () => { window.clearInterval(tick); handlers.onEnd?.(); } };
  }

  const rec = new Ctor();
  rec.lang = 'id-ID';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let final = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i] as ArrayLike<{ transcript: string }> & { isFinal?: boolean };
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    handlers.onInterim?.((final + ' ' + interim).trim());
  };
  rec.onerror = (e) => handlers.onError?.(e.error === 'not-allowed' ? 'Izin mikrofon ditolak. Aktifkan akses mikrofon di browser.' : `Mikrofon: ${e.error}`);
  rec.onend = () => {
    if (final.trim()) handlers.onResult(final.trim());
    handlers.onEnd?.();
  };
  try {
    rec.start();
  } catch {
    handlers.onError?.('Mikrofon tidak dapat dimulai.');
    handlers.onEnd?.();
  }
  return { stop: () => rec.stop() };
}

/* ── Voice: text-to-speech ──────────────────────────────────────────────── */

export const hasBrowserTts = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Speaks `text` in Indonesian; resolves when finished (or immediately when TTS is unavailable). */
export function speak(text: string, onEnd?: () => void): () => void {
  if (!hasBrowserTts()) {
    onEnd?.();
    return () => undefined;
  }
  // TODO(realtime): replace with the Alesha TTS voice (stream audio from the server).
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ''));
  u.lang = 'id-ID';
  u.rate = 1;
  const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('id'));
  if (voice) u.voice = voice;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
  return () => synth.cancel();
}
