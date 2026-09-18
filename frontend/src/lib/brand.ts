/** Application identity — single source of truth for headers, titles and the login panel. */
export const BRAND = {
  /** Organisation that owns the platform */
  org: 'Korps Lalu Lintas Polri',
  /** Product name */
  app: 'E-Learning Dikmas Lantas',
  tagline: 'Platform E-Learning & Pemantauan Lapangan Dikmas Lantas',
  /** Short label used where space is tight (sidebar subtitle, footers) */
  short: 'E-Learning Dikmas Lantas',
  /** Welcome copy on the login panel */
  intro:
    'Satu ruang kerja terpadu per instansi dengan para trainer yang mengelola materi dan melaporkan aktivitas dari lapangan, para eksekutif memantau progres strategis di tingkat nasional, provinsi, hingga kota.',
  badge: 'Multi-instansi · Berbasis wilayah penugasan',
  /**
   * Public / authentication surfaces (Login, Register, Lupa Password, Ganti Password) are GLOBAL:
   * they must never show an institution name. Use these instead of `org` / `short` there.
   */
  public: {
    name: 'Platform E-Learning',
    tagline: 'Platform E-Learning & Pemantauan Lapangan',
  },
} as const;

export const pageTitle = (section?: string) => (section ? `${section} · ${BRAND.app} — ${BRAND.org}` : `${BRAND.app} — ${BRAND.org}`);
