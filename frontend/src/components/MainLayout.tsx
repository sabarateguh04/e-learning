import { Suspense, useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Inbox,
  KeyRound,
  Layers,
  LogOut,
  MapPin,
  Menu,
  Moon,
  Search,
  Database,
  FileChartColumn,
  Settings,
  ShieldCheck,
  Sun,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useTenantStore } from '../store/tenantStore';
import { NotificationBell } from './NotificationBell';
import { AleshaWidget } from './AleshaWidget';
import { useUIStore } from '../store/uiStore';
import { ROLE, isExecutive, isSuperAdmin, isTrainer, type MenuKey } from '../lib/roles';
import { BRAND } from '../lib/brand';
import { Avatar } from './Avatar';
import { PageTransition } from './motion';

interface NavItem {
  key: MenuKey | 'profile' | 'user_management' | 'master_data';
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  section: 'Workspace' | 'Field' | 'Admin';
}

const ALL_NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard Eksekutif', to: '/dashboard', icon: BarChart3, end: true, section: 'Workspace' },
  { key: 'executive_reports', label: 'Laporan', to: '/laporan', icon: FileChartColumn, end: true, section: 'Workspace' },
  { key: 'reports_inbox', label: 'Report Inbox', to: '/reports', icon: Inbox, end: true, section: 'Workspace' },
  { key: 'modules', label: 'Modules', to: '/modules', icon: BookOpen, section: 'Workspace' },
  { key: 'submit_report', label: 'Lap Kegiatan', to: '/reports/new', icon: MapPin, section: 'Field' },
  { key: 'my_reports', label: 'Laporan Saya', to: '/reports', icon: ClipboardList, end: true, section: 'Field' },
  { key: 'profile', label: 'Profile', to: '/profile', icon: UserCircle, section: 'Workspace' },
  { key: 'user_management', label: 'Manajemen User', to: '/admin/users', icon: Users, section: 'Admin' },
  { key: 'access_management', label: 'Access Management', to: '/admin/access', icon: ShieldCheck, section: 'Admin' },
  { key: 'master_data', label: 'Kelola Master Data', to: '/admin/master-data', icon: Database, section: 'Admin' },
];
const ADMIN_ONLY = new Set(['user_management', 'access_management', 'master_data']);

/** Role defaults used until the server-side menu matrix is known. */
const defaultMenusFor = (roleLevel?: number): MenuKey[] => {
  if (isTrainer(roleLevel)) return ['modules', 'submit_report', 'my_reports'];
  if (isSuperAdmin(roleLevel)) return ['dashboard', 'executive_reports', 'reports_inbox', 'modules', 'access_management', 'settings'];
  if (isExecutive(roleLevel)) return ['dashboard', 'executive_reports', 'reports_inbox', 'modules'];
  return [];
};

/**
 * Navigation = Super Admin's menu matrix (tbl_elearning_menu_access) intersected with role.
 * "Access Management" is only ever shown to role_level === 0.
 */
const navFor = (roleLevel?: number, menus?: MenuKey[]): NavItem[] => {
  const allowed = new Set(menus?.length ? menus : defaultMenusFor(roleLevel));
  return ALL_NAV.filter((item) => {
    if (ADMIN_ONLY.has(item.key)) return roleLevel === ROLE.SUPER_ADMIN;
    if (item.key === 'profile') return true;
    return allowed.has(item.key as MenuKey);
  });
};

/** Thin progress bar that replays (via `key`) on every route change — pure CSS, no state. */
function RouteProgress({ routeKey }: { routeKey: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
      <div key={routeKey} className="h-full w-full origin-left bg-gradient-to-r from-brand-500 to-blue-600 animate-progress" />
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="h-7 w-48 rounded-md bg-slate-200 dark:bg-slate-800" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
    </div>
  );
}

export function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { tenant, clearTenant } = useTenantStore();
  const { theme, toggleTheme, sidebarOpen, setSidebarOpen } = useUIStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the avatar menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    clearTenant();
    navigate('/login', { replace: true });
  };

  const navItems = navFor(user?.role_level, user?.menus);
  const sections = [...new Set(navItems.map((n) => n.section))];
  const activeLabel =
    navItems.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))?.label ??
    (location.pathname.startsWith('/reports/new') ? 'Lap Kegiatan' : 'Overview');

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Tenant header */}
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-sky-400 to-blue-600 text-white shadow-md shadow-sky-500/20">
          <Layers className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          {/* Institution name comes from the authenticated session only — never hard-coded. */}
          <p className="truncate text-sm font-semibold leading-tight tracking-tight text-slate-900 dark:text-white" title={tenant?.name ?? BRAND.public.name}>
            {tenant?.name ?? BRAND.public.name}
          </p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{tenant ? BRAND.short : BRAND.public.tagline}</p>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-thin">
        {sections.map((section) => (
          <div key={section} className="space-y-0.5">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{section}</p>
            {navItems
              .filter((n) => n.section === section)
              .map(({ label, to, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300 ease-out hover:translate-x-0.5 active:scale-[0.98] ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-900'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <Avatar name={user?.full_name} src={user?.profile_photo_url} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{user?.full_name ?? 'Guest'}</p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400" title={`${user?.role_label ?? ''} · ${user?.scope?.label ?? ''}`}>
              {user?.role_label ?? '—'} · {user?.territory_name ?? user?.employee_id ?? '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r print:hidden border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-2xl dark:bg-slate-900 animate-fade-in">{sidebar}</aside>
        </div>
      )}

      {/* Main column */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <RouteProgress routeKey={location.pathname} />

        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b print:hidden border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden max-w-[220px] truncate text-slate-400 lg:inline" title={tenant?.name ?? BRAND.public.name}>{tenant?.name ?? BRAND.public.name}</span>
            <span className="hidden text-slate-300 dark:text-slate-700 lg:inline">/</span>
            <span className="truncate font-medium text-slate-900 dark:text-white">{activeLabel}</span>
            {user && (
              <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700 dark:border-brand-900/60 dark:bg-brand-900/40 dark:text-brand-200 md:inline-flex" title={`Level ${user.role_level}`}>
                {user.role_label}
                <span className="text-brand-400 dark:text-brand-500">·</span>
                <span className="font-normal">{user.scope?.label ?? user.territory_name}</span>
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative hidden md:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search…"
                className="h-9 w-56 rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:w-72 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-900"
              />
            </div>

            <NotificationBell />

            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>

            <div ref={menuRef} className="relative ml-1">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={user?.full_name} src={user?.profile_photo_url} size="sm" />
                <ChevronDown className={`hidden h-4 w-4 text-slate-400 transition-transform sm:block ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 animate-fade-up dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.full_name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{user?.username} · NIP {user?.employee_id}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="inline-flex rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
                        {user?.role_label ?? `Level ${user?.role_level ?? '—'}`}
                      </span>
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {user?.scope?.label ?? user?.territory_name}
                      </span>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <NavLink
                      to="/profile"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Settings className="h-4 w-4" /> Profile & settings
                    </NavLink>
                    <NavLink
                      to="/change-password"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <KeyRound className="h-4 w-4" /> Ganti password
                    </NavLink>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Routed content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 print:p-0">
          <div className="mx-auto w-full max-w-7xl">
            <Suspense fallback={<ContentSkeleton />}>
              <PageTransition routeKey={location.pathname}>
                <Outlet />
              </PageTransition>
            </Suspense>
          </div>
        </main>
      </div>
      <AleshaWidget />
    </div>
  );
}
