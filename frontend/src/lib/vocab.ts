/**
 * Tenant vocabulary. The data model is generic (trainer / unit / report); each tenant's
 * `vertical` picks the words its people use (Guru / Sekolah / Jurnal for schools, …).
 * The resolved `labels` object comes with the tenant from the API (backend/src/services/vocabulary.ts);
 * PEMERINTAHAN below is the fallback while no tenant is known.
 */
import { useTenantStore } from '../store/tenantStore';

export interface Labels {
  trainer: string;
  trainer_plural: string;
  unit_head: string;
  exec_city: string;
  exec_province: string;
  exec_national: string;
  unit: string;
  unit_plural: string;
  module: string;
  module_plural: string;
  report: string;
  report_plural: string;
  submit_report: string;
  session: string;
  participant: string;
}

export const DEFAULT_LABELS: Labels = {
  trainer: 'Trainer', trainer_plural: 'Trainer',
  unit_head: 'Pimpinan Unit', exec_city: 'Eksekutif Kota', exec_province: 'Eksekutif Provinsi', exec_national: 'Eksekutif Nasional',
  unit: 'Satuan Kerja', unit_plural: 'Satuan Kerja',
  module: 'Materi', module_plural: 'Materi',
  report: 'Laporan Lapangan', report_plural: 'Laporan Lapangan', submit_report: 'Lap Kegiatan',
  session: 'Kegiatan', participant: 'Peserta',
};

/** Labels of the current tenant (falls back to the generic set). Safe to call anywhere. */
export function useVocab(): Labels {
  const labels = useTenantStore((s) => s.tenant?.labels);
  return labels ? { ...DEFAULT_LABELS, ...labels } : DEFAULT_LABELS;
}

/** Role label in the tenant's words; `generic` is the ROLE_LABEL fallback (Super Admin etc.). */
export const roleLabelFor = (labels: Labels, roleLevel: number | undefined, generic: string): string => {
  switch (roleLevel) {
    case 1: return labels.exec_national;
    case 2: return labels.exec_province;
    case 3: return labels.exec_city;
    case 5: return labels.unit_head;
    case 4: return labels.trainer;
    default: return generic;
  }
};
