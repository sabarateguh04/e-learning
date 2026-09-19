import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Check, CheckCircle2, ClipboardCheck, KeyRound, Loader2, Lock, Pencil, Save, ShieldCheck, UserCheck, Users, X, XCircle, type LucideIcon } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { ROLE, type MenuKey, type RoleLevel } from '../lib/roles';
import type { AccountStatus } from '../types';
import { useAuthStore } from '../store/authStore';
import type { AdminOverview, AdminUser, LearningModule, ListResponse, MenuAccessResponse, MenuMatrix } from '../types';
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton, cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';
import { UserEditForm, type UserEditValues } from '../components/UserEditForm';
import { Avatar } from '../components/Avatar';
import { ResetPasswordModal } from '../components/ResetPasswordModal';
import { DataTable } from '../components/DataTable';

type TabKey = 'accounts' | 'modules' | 'menus';

const TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'accounts', label: 'Manajemen User', icon: UserCheck },
  { key: 'modules', label: 'Persetujuan Materi', icon: ClipboardCheck },
  { key: 'menus', label: 'Hak Akses Menu', icon: ShieldCheck },
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/* ── Shared bits ─────────────────────────────────────────────────────────── */
function Toast({ toast }: { toast: { tone: 'success' | 'error'; text: string } | null }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm animate-fade-in ${
        toast.tone === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'
          : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'
      }`}
    >
      {toast.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      {toast.text}
    </div>
  );
}

function ApproveRejectButtons({ busy, onApprove, onReject }: { busy: boolean; onApprove: () => void; onReject: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={onApprove}
        disabled={busy}
        title="Approve"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={busy}
        title="Reject"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}


const th = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500';

/* ── Edit user modal (role, wilayah, instansi mapping) ───────────────────── */
const toEditValues = (u: AdminUser): UserEditValues => ({
  full_name: u.full_name,
  email: u.email ?? '',
  role_level: u.role_level,
  provinsi_id: u.provinsi_id ? String(u.provinsi_id) : '',
  kota_id: u.kota_id ? String(u.kota_id) : '',
  legacy_instansi_id: u.legacy_ids.instansi ?? '',
  legacy_org_id: u.legacy_ids.organisasi ?? '',
  legacy_satker_id: u.legacy_ids.satker ?? '',
  legacy_sub_org_id: u.legacy_ids.sub_org ?? '',
});

function EditUserModal({ user, isSelf, onClose, onSaved }: { user: AdminUser; isSelf: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Edit ${user.full_name}`}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl animate-fade-up scrollbar-thin dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold">Edit user</h2>
            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">@{user.username} · NIP {user.employee_id} · {user.tenant_name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
        </div>
        <UserEditForm<AdminUser>
          initial={toEditValues(user)}
          mode="admin"
          endpoint={`/admin/users/${user.id}`}
          isSelfAdmin={isSelf}
          onCancel={onClose}
          onSaved={(res) => { onSaved(res.message); onClose(); }}
        />
      </div>
    </div>
  );
}

/* ── Tab 1: user management (all users, approve pending) ─────────────────── */
const STATUS_FILTERS: Array<AccountStatus | 'ALL'> = ['ALL', 'PENDING', 'ACTIVE', 'REJECTED'];
const statusTone = (s: AccountStatus) => (s === 'ACTIVE' ? 'success' : s === 'REJECTED' ? 'danger' : 'warning');

function AccountApprovals({ notify, onChanged }: { notify: (t: { tone: 'success' | 'error'; text: string }) => void; onChanged: () => void }) {
  const { data, loading, error, refetch } = useFetch<ListResponse<AdminUser>>('/admin/users');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<AccountStatus | 'ALL'>('PENDING');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const me = useAuthStore((s) => s.user);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.data ?? []).filter(
      (u) => (status === 'ALL' || u.account_status === status) && (!q || `${u.full_name} ${u.username} ${u.employee_id} ${u.role_label} ${u.legacy.instansi ?? ''} ${u.kota_name ?? ''} ${u.provinsi_name ?? ''}`.toLowerCase().includes(q)),
    );
  }, [data, status, query]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: data?.data.length ?? 0 };
    for (const u of data?.data ?? []) c[u.account_status] = (c[u.account_status] ?? 0) + 1;
    return c;
  }, [data]);

  const act = async (u: AdminUser, action: 'approve' | 'reject') => {
    setBusyId(u.id);
    try {
      await api.patch(`/admin/users/${u.id}/${action}`);
      notify({ tone: 'success', text: `${u.full_name} (${u.employee_id}) ${action === 'approve' ? 'is now ACTIVE and can sign in' : 'has been deactivated'}.` });
      refetch();
      onChanged();
    } catch (err) {
      notify({ tone: 'error', text: getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                status === s
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700'
              }`}
            >
              {s === 'ALL' ? 'All users' : s.charAt(0) + s.slice(1).toLowerCase()}
              <span className="ml-1.5 tabular-nums opacity-60">{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, username, NIP, instansi…" className={`${inputClass} md:w-72`} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No users match" description={status === 'PENDING' ? 'No registrations are waiting for approval.' : 'Try a different filter or search.'} />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(u) => u.id}
          actionsHeader="Aksi"
          columns={[
            {
              key: 'user', header: 'Pengguna', primary: true, className: 'min-w-[240px]',
              cell: (u) => (
                <div className="flex items-center gap-3">
                  <Avatar name={u.full_name} src={u.profile_photo_url} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.full_name}</p>
                    <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">@{u.username} · NIP {u.employee_id}</p>
                  </div>
                </div>
              ),
            },
            { key: 'role', header: 'Peran', cell: (u) => <Badge tone="brand">{u.role_label}</Badge> },
            {
              key: 'wilayah', header: 'Wilayah', hideBelow: 'lg',
              cell: (u) => (
                <div className="text-slate-600 dark:text-slate-300">
                  <p>{u.kota_name ?? u.provinsi_name ?? 'Nasional'}</p>
                  {u.kota_name && <p className="text-[11px] text-slate-500 dark:text-slate-400">{u.provinsi_name}</p>}
                </div>
              ),
            },
            {
              key: 'instansi', header: 'Instansi / Satker', hideBelow: 'xl', className: 'max-w-[240px]',
              cell: (u) => (
                <div>
                  <p className="truncate text-slate-700 dark:text-slate-200">{u.legacy.instansi ?? '—'}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{u.legacy.satker ?? u.legacy.organisasi ?? u.tenant_name}</p>
                </div>
              ),
            },
            {
              key: 'status', header: 'Status',
              cell: (u) => (
                <div className="flex flex-col items-start gap-1">
                  <Badge tone={statusTone(u.account_status)}>{u.account_status}</Badge>
                  {u.must_change_password && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300"><KeyRound className="h-3 w-3" /> wajib ganti password</span>}
                </div>
              ),
            },
            { key: 'created', header: 'Terdaftar', hideBelow: 'lg', cell: (u) => <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(u.created_at)}</span> },
          ]}
          actions={(u) => (
            <>
              <button type="button" onClick={() => setEditing(u)} title="Edit peran, wilayah & instansi" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {u.role_level !== ROLE.SUPER_ADMIN && u.id !== me?.id && (
                <button type="button" onClick={() => setResetting(u)} title="Reset password" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70">
                  <KeyRound className="h-3.5 w-3.5" />
                </button>
              )}
              {u.role_level === ROLE.SUPER_ADMIN ? null : u.account_status === 'PENDING' ? (
                <ApproveRejectButtons busy={busyId === u.id} onApprove={() => act(u, 'approve')} onReject={() => act(u, 'reject')} />
              ) : u.account_status === 'ACTIVE' ? (
                <button type="button" disabled={busyId === u.id} onClick={() => act(u, 'reject')} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600 disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:border-red-900 dark:hover:text-red-400">
                  {busyId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Nonaktifkan'}
                </button>
              ) : (
                <button type="button" disabled={busyId === u.id} onClick={() => act(u, 'approve')} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {busyId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Aktifkan lagi'}
                </button>
              )}
            </>
          )}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={(msg) => { notify({ tone: 'success', text: msg }); refetch(); }}
        />
      )}

      {editing && (
        <EditUserModal
          user={editing}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { notify({ tone: 'success', text: `${editing.full_name}: ${msg}` }); refetch(); onChanged(); }}
        />
      )}
    </div>
  );
}

/* ── Tab 2: module approvals ─────────────────────────────────────────────── */
function ModuleApprovals({ notify, onChanged }: { notify: (t: { tone: 'success' | 'error'; text: string }) => void; onChanged: () => void }) {
  const { data, loading, error, refetch } = useFetch<ListResponse<LearningModule>>('/admin/modules?status=PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (m: LearningModule, action: 'approve' | 'reject') => {
    setBusyId(m.id);
    try {
      await api.patch(`/admin/modules/${m.id}/${action}`);
      notify({ tone: 'success', text: `"${m.title}" ${action === 'approve' ? 'approved and published' : 'rejected'}.` });
      refetch();
      onChanged();
    } catch (err) {
      notify({ tone: 'error', text: getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading && !data) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data?.data.length) return <EmptyState icon={ClipboardCheck} title="No modules awaiting approval" description="Submissions from instructors will queue here." />;

  return (
    <DataTable
      rows={data.data}
      rowKey={(m) => m.id}
      actionsHeader="Aksi"
      columns={[
        {
          key: 'module', header: 'Modul', primary: true, className: 'min-w-[260px] max-w-[360px]',
          cell: (m) => (
            <div>
              <p className="font-medium">{m.title}</p>
              <p className="line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">{m.category} · {m.target_audience} · {m.duration_minutes} menit</p>
            </div>
          ),
        },
        { key: 'instructor', header: 'Pemateri', hideBelow: 'lg', cell: (m) => <span className="text-slate-600 dark:text-slate-300">{m.instructor_name}</span> },
        { key: 'owner', header: 'Pemilik', hideBelow: 'xl', cell: (m) => ((m.instansi_name ?? m.tenant_name) ? <span className="text-slate-600 dark:text-slate-300">{m.instansi_name ?? m.tenant_name}</span> : <Badge>Modul induk</Badge>) },
        { key: 'media', header: 'Media', hideBelow: 'lg', cell: (m) => <span className="text-xs text-slate-500 dark:text-slate-400">{[m.video_url && 'Video', (m.pdf_url || m.attachments.length) && 'PDF', m.has_quiz && 'Kuis'].filter(Boolean).join(' · ') || '—'}</span> },
        { key: 'created', header: 'Diajukan', cell: (m) => <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(m.created_at)}</span> },
      ]}
      actions={(m) => <ApproveRejectButtons busy={busyId === m.id} onApprove={() => act(m, 'approve')} onReject={() => act(m, 'reject')} />}
    />
  );
}

/* ── Tab 3: menu access matrix ───────────────────────────────────────────── */
function Switch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function MenuAccess({ notify }: { notify: (t: { tone: 'success' | 'error'; text: string }) => void }) {
  const { data, loading, error, refetch } = useFetch<MenuAccessResponse>('/admin/menu-access');
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (loading || !data) return <Skeleton className="h-80 rounded-2xl" />;
  // Re-mount the editor whenever the server matrix changes so local draft state resets cleanly.
  return <MenuAccessEditor key={JSON.stringify(data.matrix)} data={data} notify={notify} onSaved={refetch} />;
}

function MenuAccessEditor({ data, notify, onSaved }: { data: MenuAccessResponse; notify: (t: { tone: 'success' | 'error'; text: string }) => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<MenuMatrix>(data.matrix);
  const [saving, setSaving] = useState(false);
  const setMenus = useAuthStore((s) => s.setMenus);
  const me = useAuthStore((s) => s.user);

  const dirty = useMemo(() => JSON.stringify(data.matrix) !== JSON.stringify(draft), [data.matrix, draft]);

  const toggle = (key: MenuKey, level: RoleLevel, value: boolean) => setDraft((d) => ({ ...d, [key]: { ...d[key], [level]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      const { data: res } = await api.put<{ matrix: MenuMatrix }>('/admin/menu-access', { matrix: draft });
      notify({ tone: 'success', text: 'Menu access matrix saved. Changes apply on the next page load for affected users.' });
      if (me) setMenus((Object.keys(res.matrix) as MenuKey[]).filter((k) => res.matrix[k][String(me.role_level)]));
      onSaved();
    } catch (err) {
      notify({ tone: 'error', text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${cardClass} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className={th}>Menu / feature</th>
              {data.roles.map((r) => (
                <th key={r.level} className={`${th} text-center`}>
                  <span className="block">{r.label}</span>
                  <span className="font-mono text-[10px] normal-case tracking-normal text-slate-400">level {r.level}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.menus.map((menu) => (
              <tr key={menu.key} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-4 py-3">
                  <p className="font-medium">{menu.label}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{menu.description}</p>
                </td>
                {data.roles.map((r) => {
                  const locked = menu.locked?.includes(r.level);
                  return (
                    <td key={r.level} className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <Switch checked={Boolean(draft[menu.key][String(r.level)])} disabled={locked} onChange={(v) => toggle(menu.key, r.level, v)} />
                        {locked && <Lock className="h-3 w-3 text-slate-400" />}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Toggles are enforced by the API as well as the sidebar. <Lock className="inline h-3 w-3" /> Access Management is always on for Super Admin.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft(data.matrix)} disabled={!dirty || saving} className={secondaryButtonClass}>Discard</button>
          <button type="button" onClick={save} disabled={!dirty || saving} className={primaryButtonClass}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save matrix
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Header stats: role badge + counters, each pill on its own box so text never overlaps ── */
function HeaderStats({ overview }: { overview: AdminOverview }) {
  const stat = (value: number, label: string, Icon: LucideIcon) => (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{value}</span>
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="brand">{ROLE_LABEL_SUPER_ADMIN}</Badge>
      {stat(overview.tenants, 'instansi', Building2)}
      {stat(overview.users.ACTIVE, 'pengguna aktif', Users)}
    </div>
  );
}
const ROLE_LABEL_SUPER_ADMIN = 'Super Admin';

/* ── Page ─────────────────────────────────────────────────────────────────── */
export function AdminAccessManager({ initialTab = 'accounts', title = 'Access Management' }: { initialTab?: TabKey; title?: string }) {
  const [params] = useSearchParams();
  const requested = params.get('tab') as TabKey | null;
  const [tab, setTab] = useState<TabKey>(requested && TABS.some((t) => t.key === requested) ? requested : initialTab);
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const overview = useFetch<AdminOverview>('/admin/overview');

  const counts: Partial<Record<TabKey, number>> = {
    accounts: overview.data?.users.PENDING,
    modules: overview.data?.modules.PENDING,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="Kelola persetujuan akun dan materi trainer serta atur matriks hak akses menu per peran."
        action={overview.data && <HeaderStats overview={overview.data} />}
      />

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/70 p-1 dark:border-slate-800 dark:bg-slate-900">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setToast(null); }}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {counts[key] ? (
              <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">{counts[key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <Toast toast={toast} />

      <div key={tab} className="animate-fade-up">
        {tab === 'accounts' && <AccountApprovals notify={setToast} onChanged={overview.refetch} />}
        {tab === 'modules' && <ModuleApprovals notify={setToast} onChanged={overview.refetch} />}
        {tab === 'menus' && <MenuAccess notify={setToast} />}
      </div>
    </div>
  );
}
