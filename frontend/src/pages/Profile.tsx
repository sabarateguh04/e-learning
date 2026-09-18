import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AtSign, Briefcase, Building2, CalendarCheck, Camera, Clock, IdCard, KeyRound, Landmark, Mail, MapPin, Network, Pencil, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { useFetch } from '../lib/hooks';
import { useAuthStore, type User } from '../store/authStore';
import type { Profile as ProfileData } from '../types';
import { Badge, ErrorState, PageHeader, Skeleton, cardClass, secondaryButtonClass } from '../components/ui';
import { UserEditForm, type UserEditValues } from '../components/UserEditForm';
import { Avatar } from '../components/Avatar';
import { ProfilePhotoEditor } from '../components/ProfilePhotoEditor';
import { StepTransition } from '../components/motion';

type Tab = 'overview' | 'edit' | 'photo';
const TABS: Array<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: 'overview', label: 'Ringkasan', icon: UserRound },
  { key: 'edit', label: 'Edit Profil', icon: Pencil },
  { key: 'photo', label: 'Foto Profil', icon: Camera },
];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const toValues = (p: ProfileData): UserEditValues => ({
  full_name: p.full_name,
  email: p.email ?? '',
  role_level: p.role_level,
  provinsi_id: p.wilayah.provinsi_id ? String(p.wilayah.provinsi_id) : '',
  kota_id: p.wilayah.kota_id ? String(p.wilayah.kota_id) : '',
  legacy_instansi_id: p.instansi.legacy_instansi_id ?? '',
  legacy_org_id: p.instansi.legacy_org_id ?? '',
  legacy_satker_id: p.instansi.legacy_satker_id ?? '',
  legacy_sub_org_id: p.instansi.legacy_sub_org_id ?? '',
});

/* ── Building blocks ─────────────────────────────────────────────────────── */
function InfoCard({ title, icon: Icon, children, className = '' }: { title: string; icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <section className={`${cardClass} ${className}`}>
      <header className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-3.5 w-3.5" /></span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>
      <dl className="divide-y divide-slate-100 px-5 dark:divide-slate-800">{children}</dl>
    </section>
  );
}

function Row({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] items-start gap-4 py-2.5 text-sm">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`min-w-0 break-words font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value || <span className="font-normal text-slate-400">—</span>}</dd>
    </div>
  );
}

/** Instansi → Organisasi → Satuan Kerja → Sub Organisasi as a vertical chain. */
function HierarchyChain({ p }: { p: ProfileData }) {
  const levels = [
    { label: 'Instansi', value: p.instansi.instansi_name, icon: Landmark },
    { label: 'Organisasi', value: p.instansi.organisasi_name, icon: Network },
    { label: 'Satuan Kerja', value: p.instansi.satker_name, icon: Briefcase },
    { label: 'Sub Organisasi', value: p.instansi.sub_org_name, icon: Building2 },
  ];
  return (
    <ol className="relative px-5 py-2">
      {levels.map(({ label, value, icon: Icon }, i) => (
        <li key={label} className="relative flex gap-3 pb-4 last:pb-2">
          {i < levels.length - 1 && <span aria-hidden className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-slate-200 dark:bg-slate-800" />}
          <span className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-900 ${value ? 'bg-brand-50 text-brand-600 dark:bg-brand-900/50 dark:text-brand-300' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            <p className={`text-sm ${value ? 'font-medium' : 'text-slate-400'}`}>{value ?? 'Belum ditetapkan'}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function Profile() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const profile = useFetch<{ data: ProfileData }>('/auth/profile');
  const p = profile.data?.data;
  const [tab, setTab] = useState<Tab>('overview');
  const [dir, setDir] = useState(1);
  const go = (t: Tab) => {
    setDir(TABS.findIndex((x) => x.key === t) > TABS.findIndex((x) => x.key === tab) ? 1 : -1);
    setTab(t);
  };

  if (profile.error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profil" />
        <ErrorState message={profile.error} onRetry={profile.refetch} />
      </div>
    );
  }
  if (!p) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 rounded-2xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>
      </div>
    );
  }

  const wilayah = p.wilayah.kota_name ?? p.wilayah.provinsi_name ?? 'Nasional';

  return (
    <div className="space-y-6">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className={`${cardClass} overflow-hidden`}>
        <div className="h-24 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950" />
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <button type="button" onClick={() => go('photo')} title="Ubah foto profil" className="group relative shrink-0 rounded-full ring-4 ring-white transition-transform hover:scale-[1.03] dark:ring-slate-900">
                <Avatar name={p.full_name} src={p.profile_photo_url} size="xl" className="ring-0" />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/0 text-white opacity-0 transition-all group-hover:bg-slate-900/45 group-hover:opacity-100"><Camera className="h-5 w-5" /></span>
              </button>
              <div className="min-w-0 pb-1">
                <h1 className="truncate text-xl font-bold tracking-tight">{p.full_name}</h1>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1 font-mono text-xs"><AtSign className="h-3.5 w-3.5" />{p.username}</span>
                  <span className="inline-flex items-center gap-1 text-xs"><IdCard className="h-3.5 w-3.5" />NIP {p.employee_id}</span>
                  {p.email && <span className="inline-flex items-center gap-1 text-xs"><Mail className="h-3.5 w-3.5" />{p.email}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:pb-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-900/60 dark:bg-brand-900/40 dark:text-brand-200"><ShieldCheck className="h-3.5 w-3.5" />{p.role_label}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"><MapPin className="h-3.5 w-3.5" />{wilayah}</span>
              <Badge tone={p.account_status === 'ACTIVE' ? 'success' : 'warning'}>{p.account_status}</Badge>
            </div>
          </div>
        </div>
        {/* Tabs */}
        <nav className="flex gap-1 border-t border-slate-100 px-3 dark:border-slate-800" aria-label="Bagian profil">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => go(key)} aria-pressed={tab === key} className={`relative -mb-px flex items-center gap-2 px-3 py-3 text-sm font-medium transition-colors ${tab === key ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
              <Icon className="h-4 w-4" /> {label}
              {tab === key && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-slate-900 dark:bg-white" />}
            </button>
          ))}
        </nav>
      </section>

      <StepTransition stepKey={tab} direction={dir}>
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <InfoCard title="Akun" icon={UserRound}>
              <Row label="Nama" value={p.full_name} />
              <Row label="Username" value={`@${p.username}`} mono />
              <Row label="NIP" value={p.employee_id} mono />
              <Row label="Email" value={p.email} />
              <Row label="Peran" value={<Badge tone="brand">{p.role_label}</Badge>} />
              <Row label="Status" value={<Badge tone={p.account_status === 'ACTIVE' ? 'success' : 'warning'}>{p.account_status}</Badge>} />
            </InfoCard>

            <InfoCard title="Wilayah Penugasan" icon={MapPin}>
              <Row label="Cakupan" value={<span className="font-mono text-xs">{p.wilayah.level}</span>} />
              <Row label="Provinsi" value={p.wilayah.provinsi_name} />
              <Row label="Kota" value={p.wilayah.kota_name} />
              <Row label="Unit" value={p.tenant.name} />
            </InfoCard>

            <section className={cardClass}>
              <header className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Landmark className="h-3.5 w-3.5" /></span>
                <h2 className="text-sm font-semibold">Pemetaan Instansi</h2>
              </header>
              <HierarchyChain p={p} />
            </section>

            <InfoCard title="Aktivitas Akun" icon={Clock} className="lg:col-span-2">
              <Row label="Terdaftar" value={fmt(p.created_at)} />
              <Row label="Disetujui" value={fmt(p.approved_at)} />
              <Row label="Login terakhir" value={fmt(p.last_login_at)} />
            </InfoCard>

            <section className={`${cardClass} flex flex-col justify-between p-5`}>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"><KeyRound className="h-3.5 w-3.5" /></span>
                  <h2 className="text-sm font-semibold">Keamanan</h2>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Ganti password secara berkala dan jangan bagikan kredensial Anda.</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/change-password" className={secondaryButtonClass}><KeyRound className="h-4 w-4" /> Ganti password</Link>
                <button type="button" onClick={() => go('edit')} className={secondaryButtonClass}><Pencil className="h-4 w-4" /> Edit profil</button>
              </div>
            </section>
          </div>
        )}

        {tab === 'edit' && (
          <section className={cardClass}>
            <header className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold">Edit profil</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Nama, kontak, wilayah penugasan, dan pemetaan instansi. Perubahan peran dilakukan oleh Super Admin.</p>
            </header>
            <UserEditForm<ProfileData>
              key={JSON.stringify(toValues(p))}
              initial={toValues(p)}
              mode="self"
              endpoint="/auth/profile"
              onSaved={(res) => {
                if (res.token && res.user) setAuth(res.token, res.user as User);
                profile.refetch();
                go('overview');
              }}
            />
          </section>
        )}

        {tab === 'photo' && (
          <section className={`${cardClass} p-5`}>
            <ProfilePhotoEditor name={p.full_name} photoUrl={p.profile_photo_url} onChanged={() => profile.refetch()} />
            <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"><CalendarCheck className="h-3.5 w-3.5" /> Foto tampil di bilah atas, sidebar, dan daftar pengguna.</p>
          </section>
        )}
      </StepTransition>
    </div>
  );
}
