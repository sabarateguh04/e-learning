/** Education levels a module targets — mirrors backend TARGET_AUDIENCES / DB ENUM. */
export const TARGET_AUDIENCES = ['TK/SD', 'MTS/SMP', 'SMA/SMK', 'Mahasiswa', 'Umum'] as const;
export type TargetAudience = (typeof TARGET_AUDIENCES)[number];

export const AUDIENCE_META: Record<TargetAudience, { label: string; description: string; tone: string }> = {
  'TK/SD': { label: 'TK/SD', description: 'Taman Kanak-kanak & Sekolah Dasar', tone: 'bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-950/50 dark:text-pink-300 dark:ring-pink-900' },
  'MTS/SMP': { label: 'MTS/SMP', description: 'Madrasah Tsanawiyah & Sekolah Menengah Pertama', tone: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900' },
  'SMA/SMK': { label: 'SMA/SMK', description: 'Sekolah Menengah Atas & Kejuruan', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900' },
  Mahasiswa: { label: 'Mahasiswa', description: 'Perguruan tinggi', tone: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900' },
  Umum: { label: 'Umum', description: 'Masyarakat umum & semua jenjang', tone: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900' },
};

export const isTargetAudience = (v: string): v is TargetAudience => (TARGET_AUDIENCES as readonly string[]).includes(v);
export const audienceTone = (v: string) => (isTargetAudience(v) ? AUDIENCE_META[v].tone : AUDIENCE_META.Umum.tone);
