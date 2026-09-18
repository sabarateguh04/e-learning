import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MenuKey, RoleLevel } from '../lib/roles';

export type TerritoryLevel = 'NATIONAL' | 'PROVINCE' | 'CITY';

export interface UserScope {
  role_level: RoleLevel;
  scope: 'TENANT' | 'PROVINCE' | 'CITY' | 'SELF';
  label: string;
}

/** Mirrors the JWT payload + presentation fields returned by /auth/login */
export interface User {
  id: string;
  tenant_id: string;
  username: string;
  employee_id: string;
  full_name: string;
  role_level: RoleLevel;
  role_label: string;
  provinsi_id: number | null;
  kota_id: number | null;
  provinsi_name: string | null;
  kota_name: string | null;
  territory_level: TerritoryLevel;
  territory_name: string;
  scope: UserScope;
  /** Menu keys enabled for this role by the Super Admin (tbl_elearning_menu_access). */
  menus: MenuKey[];
  profile_photo_url: string | null;
  /** Set after an admin reset; the API blocks everything except /auth/change-password until cleared. */
  must_change_password?: boolean;
  legacy: { instansi: string | null; organisasi: string | null; satker: string | null; sub_org: string | null } | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setMenus: (menus: MenuKey[]) => void;
  setPhoto: (url: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setMenus: (menus) => set((s) => (s.user ? { user: { ...s.user, menus } } : s)),
      setPhoto: (profile_photo_url) => set((s) => (s.user ? { user: { ...s.user, profile_photo_url } } : s)),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'auth-session' },
  ),
);

export const selectIsAuthenticated = (state: AuthState) => Boolean(state.token);
export const selectRoleLevel = (state: AuthState) => state.user?.role_level;
