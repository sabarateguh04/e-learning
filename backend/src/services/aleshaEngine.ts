/**
 * Alesha AI — DUMMY engine.
 *
 * This is the single place the real engine plugs in. Everything the UI needs already flows
 * through `chat()`: the user's message, the conversation so far and a small page context.
 *
 *   TODO(realtime): replace `dummyReply()` with the real pipeline —
 *     1. if ALESHA_API_URL is set, `forwardToAlesha()` below already proxies to the legacy
 *        engine contract (POST {ALESHA_API_URL}/api/chat/learning) and falls back to dummy;
 *     2. or call an LLM directly (system prompt = SINAU context: modul, kuis, laporan lapangan);
 *     3. for streaming, expose an SSE variant of POST /api/alesha/chat and read it in
 *        frontend/src/lib/alesha.ts (`askAlesha`).
 *   Voice (STT/TTS) is currently done in the browser (Web Speech API) — see frontend/src/lib/alesha.ts.
 */
import { moduleRepo } from '../repositories/moduleRepo';
import { BRAND } from '../config';

export interface ChatTurn { role: 'user' | 'assistant'; content: string }
export interface ChatContext { page?: string; user_name?: string | null; role_label?: string | null; module_title?: string | null }
export interface ChatReply { reply: string; suggestions: string[]; engine: 'dummy' | 'alesha'; latency_ms: number }

export const ALESHA = { name: 'Alesha AI', engine: process.env.ALESHA_API_URL ? 'alesha' : 'dummy', voice: 'browser' } as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_SUGGESTIONS = ['Materi apa saja yang tersedia?', 'Bagaimana cara membuat laporan lapangan?', 'Cara mengerjakan kuis', 'Apa itu SINAU?'];

async function dummyReply(message: string, ctx: ChatContext): Promise<{ reply: string; suggestions: string[] }> {
  const m = norm(message);
  const sapa = ctx.user_name ? `, ${ctx.user_name.split(' ')[0]}` : '';

  if (!m) return { reply: `Halo${sapa}! Saya Alesha, asisten ${BRAND.app}. Ada yang bisa saya bantu?`, suggestions: DEFAULT_SUGGESTIONS };

  if (has(m, 'halo', 'hai', 'hello', 'selamat', 'assalamu', 'pagi', 'siang', 'sore', 'malam')) {
    return {
      reply: `Halo${sapa}! Saya Alesha, asisten virtual ${BRAND.app}. Saya bisa bantu mencari materi, menjelaskan cara membuat laporan lapangan, atau menjawab pertanyaan seputar aplikasi. Mau mulai dari mana?`,
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  if (has(m, 'materi', 'modul', 'pelajaran', 'video', 'belajar', 'kursus')) {
    const modules = await moduleRepo.listPublic();
    const top = modules.slice(0, 3).map((x, i) => `${i + 1}. ${x.title}${x.instansi_name ? ` — ${x.instansi_name}` : ''}`).join('\n');
    return {
      reply: modules.length
        ? `Saat ini ada ${modules.length} materi yang sudah disetujui. Yang paling banyak dilihat:\n${top}\n\nMau saya carikan materi untuk jenjang tertentu (TK/SD, SMP, SMA, Mahasiswa, Umum)?`
        : 'Belum ada materi yang disetujui saat ini. Materi yang diunggah trainer akan muncul setelah disetujui Super Admin.',
      suggestions: ['Materi untuk SD', 'Materi untuk SMA', 'Materi paling populer', 'Cara mengerjakan kuis'],
    };
  }

  if (has(m, 'laporan', 'lapor', 'kegiatan', 'lapangan', 'bukti', 'foto')) {
    return {
      reply:
        'Untuk membuat laporan kegiatan lapangan:\n1. Buka menu Laporan Lapangan → Buat Laporan.\n2. Pilih materi yang dipresentasikan, lokasi, dan jumlah peserta.\n3. Unggah 2–4 foto bukti kegiatan.\n4. Kirim — laporan akan masuk ke inbox persetujuan eksekutif wilayah Anda.',
      suggestions: ['Status laporan saya', 'Siapa yang menyetujui laporan?', 'Materi apa saja yang tersedia?'],
    };
  }

  if (has(m, 'kuis', 'quiz', 'soal', 'ujian', 'nilai', 'skor')) {
    return {
      reply:
        'Kuis ada di akhir setiap materi yang memiliki evaluasi. Buka materi → tonton video atau baca ringkasan → tekan Mulai Kuis. Nilai kelulusan dan batas waktu ditentukan oleh pembuat materi, dan hasilnya tersimpan di riwayat belajar Anda.',
      suggestions: ['Materi apa saja yang tersedia?', 'Bagaimana cara membuat laporan lapangan?'],
    };
  }

  if (has(m, 'sinau', 'aplikasi', 'apa itu', 'tentang', 'fungsi')) {
    return {
      reply: `${BRAND.app} ("sinau" = belajar dalam bahasa Jawa) adalah ${BRAND.tagline.toLowerCase()}: trainer mengelola materi edukasi dan melaporkan kegiatan dari lapangan, sementara eksekutif memantau progres di tingkat nasional, provinsi, hingga kota.`,
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  if (has(m, 'terima kasih', 'makasih', 'thanks', 'matur')) {
    return { reply: `Sama-sama${sapa}! Kalau ada lagi yang ingin ditanyakan, saya di sini. Selamat sinau!`, suggestions: DEFAULT_SUGGESTIONS };
  }

  const where = ctx.module_title ? ` Saya lihat Anda sedang membuka materi "${ctx.module_title}" —` : '';
  return {
    reply: `Maaf${sapa}, saya masih dalam mode demo dan belum bisa menjawab pertanyaan itu.${where} coba tanyakan tentang materi, laporan lapangan, atau kuis.`,
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

/** Legacy Alesha engine contract (kept from sm-learning). Returns null when unavailable. */
async function forwardToAlesha(message: string, history: ChatTurn[], ctx: ChatContext): Promise<string | null> {
  const base = process.env.ALESHA_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/chat/learning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, context: { app: BRAND.app, ...ctx } }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reply?: string; answer?: string };
    return data.reply ?? data.answer ?? null;
  } catch (err) {
    console.warn('[alesha] engine unreachable, falling back to dummy:', (err as Error).message);
    return null;
  }
}

export async function chat(message: string, history: ChatTurn[], ctx: ChatContext): Promise<ChatReply> {
  const started = Date.now();
  const forwarded = await forwardToAlesha(message, history, ctx);
  if (forwarded) return { reply: forwarded, suggestions: [], engine: 'alesha', latency_ms: Date.now() - started };

  await sleep(400 + Math.random() * 500); // pretend to think
  const { reply, suggestions } = await dummyReply(message, ctx);
  return { reply, suggestions, engine: 'dummy', latency_ms: Date.now() - started };
}
