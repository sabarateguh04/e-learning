/**
 * Per-vertical vocabulary. The data model is generic (trainer / unit / report); each tenant's
 * `vertical` (tbl_tenant_settings) picks the words its people actually use. The frontend receives
 * the resolved `labels` object with the tenant and never hard-codes these terms.
 */
export const VERTICALS = ['pemerintahan', 'pendidikan', 'korporasi'] as const;
export type Vertical = (typeof VERTICALS)[number];

export const APPROVAL_FLOWS = ['TERRITORY', 'UNIT_HEAD'] as const;
export type ApprovalFlow = (typeof APPROVAL_FLOWS)[number];

export interface Labels {
  /** role names */
  trainer: string;
  trainer_plural: string;
  unit_head: string;
  exec_city: string;
  exec_province: string;
  exec_national: string;
  /** organisation */
  unit: string;
  unit_plural: string;
  /** artefacts */
  module: string;
  module_plural: string;
  report: string;
  report_plural: string;
  submit_report: string;
  /** activity being reported */
  session: string;
  participant: string;
}

const PEMERINTAHAN: Labels = {
  trainer: 'Trainer', trainer_plural: 'Trainer',
  unit_head: 'Pimpinan Unit', exec_city: 'Eksekutif Kota', exec_province: 'Eksekutif Provinsi', exec_national: 'Eksekutif Nasional',
  unit: 'Satuan Kerja', unit_plural: 'Satuan Kerja',
  module: 'Materi', module_plural: 'Materi',
  report: 'Laporan Lapangan', report_plural: 'Laporan Lapangan', submit_report: 'Lap Kegiatan',
  session: 'Kegiatan', participant: 'Peserta',
};

const PENDIDIKAN: Labels = {
  trainer: 'Guru', trainer_plural: 'Guru',
  unit_head: 'Kepala Sekolah', exec_city: 'Pengawas Kota/Kabupaten', exec_province: 'Pengawas Provinsi', exec_national: 'Kementerian',
  unit: 'Sekolah', unit_plural: 'Sekolah',
  module: 'Bahan Ajar', module_plural: 'Bahan Ajar',
  report: 'Jurnal Kegiatan', report_plural: 'Jurnal Kegiatan', submit_report: 'Isi Jurnal',
  session: 'Kegiatan Belajar', participant: 'Siswa',
};

const KORPORASI: Labels = {
  trainer: 'Fasilitator', trainer_plural: 'Fasilitator',
  unit_head: 'Kepala Cabang', exec_city: 'Area Manager', exec_province: 'Regional Manager', exec_national: 'Kantor Pusat',
  unit: 'Cabang', unit_plural: 'Cabang',
  module: 'Materi', module_plural: 'Materi',
  report: 'Laporan Kegiatan', report_plural: 'Laporan Kegiatan', submit_report: 'Buat Laporan',
  session: 'Sesi', participant: 'Peserta',
};

export const LABELS: Record<Vertical, Labels> = { pemerintahan: PEMERINTAHAN, pendidikan: PENDIDIKAN, korporasi: KORPORASI };

export const labelsFor = (vertical: string | null | undefined): Labels => LABELS[(vertical as Vertical) in LABELS ? (vertical as Vertical) : 'pemerintahan'];

/** Role label in the tenant's own words (falls back to the generic ROLE_LABEL for Super Admin). */
export const roleLabelFor = (vertical: string | null | undefined, roleLevel: number, generic: string): string => {
  const l = labelsFor(vertical);
  switch (roleLevel) {
    case 1: return l.exec_national;
    case 2: return l.exec_province;
    case 3: return l.exec_city;
    case 5: return l.unit_head;
    case 4: return l.trainer;
    default: return generic;
  }
};
