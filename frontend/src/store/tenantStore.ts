import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  logoUrl?: string;
  themeColor?: string;
  instansi_name?: string | null;
  /** pemerintahan | pendidikan | korporasi — picks the vocabulary */
  vertical?: string;
  /** TERRITORY | UNIT_HEAD — who approves a trainer's report first */
  approval_flow?: string;
  /** resolved vocabulary from the API (see lib/vocab.ts) */
  labels?: Partial<import('../lib/vocab').Labels>;
}

interface TenantState {
  tenant: Tenant | null;
  setTenant: (tenant: Tenant | null) => void;
  clearTenant: () => void;
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      tenant: null,
      setTenant: (tenant) => set({ tenant }),
      clearTenant: () => set({ tenant: null }),
    }),
    { name: 'tenant-context' },
  ),
);
