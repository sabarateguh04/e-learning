import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import axios from 'axios';
import { Briefcase, CheckCircle2, GitBranch, Landmark, Loader2, Map, MapPin, Network, Plus, Search, X, XCircle, type LucideIcon } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { EMPTY_INSTANSI } from '../lib/forms';
import type { ApiValidationError, KotaRecord, LegacyRecord, ListResponse, ProvinsiRecord } from '../types';
import { Badge, ErrorState, PageHeader, Skeleton, inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';
import { InstansiSelects, type InstansiDepth, type InstansiValue } from '../components/CascadingSelects';
import { DataTable, type Column } from '../components/DataTable';

/* ── Tabs: user-facing Indonesian labels only (no table names) ─────────────── */
type TabKey = 'provinsi' | 'kota' | 'instansi' | 'organisasi' | 'satker' | 'sub_org';

interface TabMeta {
  key: TabKey;
  /** Tab pill */
  tab: string;
  /** Section title */
  title: string;
  /** Singular noun used by the "Tambah …" button and modal */
  singular: string;
  description: string;
  icon: LucideIcon;
  parent?: InstansiDepth;
  parentLabel?: string;
}

const TABS: TabMeta[] = [
  { key: 'provinsi', tab: 'Provinsi', title: 'Wilayah Provinsi', singular: 'Provinsi', description: 'Daftar provinsi yang tersedia untuk penugasan dan pelaporan.', icon: Map },
  { key: 'kota', tab: 'Kota', title: 'Wilayah Kota', singular: 'Kota', description: 'Kota/kabupaten di bawah masing-masing provinsi.', icon: MapPin },
  { key: 'instansi', tab: 'Instansi', title: 'Manajemen Instansi', singular: 'Instansi', description: 'Instansi induk — tingkat teratas pemetaan organisasi.', icon: Landmark },
  { key: 'organisasi', tab: 'Organisasi', title: 'Daftar Organisasi', singular: 'Organisasi', description: 'Organisasi di bawah instansi.', icon: Network, parent: 'instansi', parentLabel: 'Instansi' },
  { key: 'satker', tab: 'Satuan Kerja', title: 'Satuan Kerja', singular: 'Satuan Kerja', description: 'Satuan kerja di bawah organisasi.', icon: Briefcase, parent: 'organisasi', parentLabel: 'Organisasi' },
  { key: 'sub_org', tab: 'Sub Organisasi', title: 'Sub Organisasi', singular: 'Sub Organisasi', description: 'Sub organisasi di bawah satuan kerja.', icon: GitBranch, parent: 'satker', parentLabel: 'Satuan Kerja' },
];
const TAB_BY_KEY = Object.fromEntries(TABS.map((t) => [t.key, t])) as Record<TabKey, TabMeta>;
const PARENT_KEY: Record<InstansiDepth, keyof InstansiValue> = { instansi: 'legacy_instansi_id', organisasi: 'legacy_org_id', satker: 'legacy_satker_id', sub_org: 'legacy_sub_org_id' };

type Toast = { tone: 'success' | 'error'; text: string } | null;

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">{label}</label>
      {children}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl animate-fade-up dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}

/* ── Add form (label always follows the active tab's meta) ─────────────────── */
function AddForm({ meta, provinsi, onDone, onCancel }: { meta: TabMeta; provinsi: ProvinsiRecord[]; onDone: (msg: string) => void; onCancel: () => void }) {
  const [nama, setNama] = useState('');
  const [kode, setKode] = useState('');
  const [provinsiId, setProvinsiId] = useState('');
  const [chain, setChain] = useState<InstansiValue>(EMPTY_INSTANSI);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isRegion = meta.key === 'provinsi' || meta.key === 'kota';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFailure(null);
    setErrors({});
    try {
      const parentId = meta.parent ? chain[PARENT_KEY[meta.parent]] || null : null;
      const body = meta.key === 'kota' ? { provinsi_id: Number(provinsiId), nama, kode } : meta.key === 'provinsi' ? { nama, kode } : { nama, parent_id: parentId };
      const { data } = await api.post<{ message: string }>(`/admin/master/${meta.key}`, body);
      onDone(data.message);
    } catch (err) {
      if (axios.isAxiosError<ApiValidationError>(err) && err.response?.status === 422 && err.response.data.errors) setErrors(err.response.data.errors);
      setFailure(getErrorMessage(err, 'Gagal menyimpan.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={saving} className="space-y-4 p-5">
        {failure && !Object.keys(errors).length && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{failure}</p>}

        {meta.key === 'kota' && (
          <Field label="Provinsi" htmlFor="provinsi_id" error={errors.provinsi_id}>
            <select id="provinsi_id" value={provinsiId} onChange={(e) => setProvinsiId(e.target.value)} className={inputClass} autoFocus>
              <option value="">Pilih provinsi…</option>
              {provinsi.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
            </select>
          </Field>
        )}

        <Field label={`Nama ${meta.singular}`} htmlFor="nama" error={errors.nama}>
          <input id="nama" value={nama} onChange={(e) => setNama(e.target.value)} className={inputClass} placeholder={meta.key === 'provinsi' ? 'contoh: Jawa Timur' : meta.key === 'kota' ? 'contoh: Kota Surabaya' : `Nama ${meta.singular.toLowerCase()}`} autoFocus={meta.key !== 'kota'} />
        </Field>

        {isRegion && (
          <Field label="Kode (opsional)" htmlFor="kode" error={errors.kode} hint={meta.key === 'provinsi' ? 'Kode wilayah 2 digit, contoh 35' : 'Kode wilayah 4 digit, contoh 3578'}>
            <input id="kode" value={kode} onChange={(e) => setKode(e.target.value)} className={inputClass} inputMode="numeric" placeholder={meta.key === 'provinsi' ? '35' : '3578'} />
          </Field>
        )}

        {meta.parent && (
          <div className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Induk · {meta.parentLabel}</p>
            <InstansiSelects idPrefix="add_" value={chain} onChange={(v) => { setChain(v); setErrors((e) => { const { parent_id: _p, ...rest } = e; return rest; }); }} depth={meta.parent} requireInstansi={false} />
            {errors.parent_id && <p className="text-xs text-red-600 dark:text-red-400">{errors.parent_id}</p>}
          </div>
        )}
        {!isRegion && <p className="text-[11px] text-slate-500 dark:text-slate-400">Kode identitas dibuat otomatis dari nama.</p>}
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>Batal</button>
        <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Simpan {meta.singular}</button>
      </div>
    </form>
  );
}

/* ── Reassign parent ───────────────────────────────────────────────────────── */
function ReassignForm({ meta, row, onDone, onCancel }: { meta: TabMeta; row: LegacyRecord; onDone: (msg: string) => void; onCancel: () => void }) {
  const [chain, setChain] = useState<InstansiValue>(EMPTY_INSTANSI);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const parentId = meta.parent ? chain[PARENT_KEY[meta.parent]] : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFailure(null);
    try {
      const { data } = await api.patch<{ message: string }>(`/admin/master/${meta.key}/${row.id}`, { parent_id: parentId || null });
      onDone(`${row.nama}: ${data.message}`);
    } catch (err) {
      setFailure(getErrorMessage(err, 'Gagal memperbarui induk.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={saving} className="space-y-4 p-5">
        <p className="text-sm">
          <span className="font-medium">{row.nama}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{meta.parentLabel} saat ini: {row.parent_nama ?? 'belum ditetapkan'}</span>
        </p>
        {failure && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">{failure}</p>}
        <InstansiSelects idPrefix="re_" value={chain} onChange={setChain} depth={meta.parent} requireInstansi={false} />
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Kosongkan {meta.parentLabel?.toLowerCase()} untuk menandai baris ini sebagai belum ditetapkan.</p>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <button type="button" onClick={onCancel} className={secondaryButtonClass}>Batal</button>
        <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />} Simpan induk</button>
      </div>
    </form>
  );
}

/* ── Column definitions ────────────────────────────────────────────────────── */
const mono = 'font-mono text-xs text-slate-500 dark:text-slate-400';
const num = 'tabular-nums text-slate-500 dark:text-slate-400';

const provinsiColumns: Column<ProvinsiRecord>[] = [
  { key: 'nama', header: 'Provinsi', primary: true, cell: (r) => <span className="font-medium">{r.nama}</span> },
  { key: 'kode', header: 'Kode', cell: (r) => <span className={mono}>{r.kode ?? '—'}</span>, hideBelow: 'lg' },
  { key: 'kota', header: 'Kota', align: 'right', cell: (r) => <span className="tabular-nums">{r.kota_count}</span> },
  { key: 'users', header: 'Pengguna', align: 'right', cell: (r) => <span className={num}>{r.user_count}</span> },
];
const kotaColumns: Column<KotaRecord>[] = [
  { key: 'nama', header: 'Kota', primary: true, cell: (r) => <span className="font-medium">{r.nama}</span> },
  { key: 'prov', header: 'Provinsi', cell: (r) => <span className="text-slate-600 dark:text-slate-300">{r.provinsi_nama}</span> },
  { key: 'kode', header: 'Kode', cell: (r) => <span className={mono}>{r.kode ?? '—'}</span>, hideBelow: 'lg' },
  { key: 'users', header: 'Pengguna', align: 'right', cell: (r) => <span className={num}>{r.user_count}</span> },
];
const legacyColumns = (meta: TabMeta): Column<LegacyRecord>[] => [
  { key: 'nama', header: meta.singular, primary: true, cell: (r) => <span className="font-medium">{r.nama}</span>, className: 'min-w-[220px]' },
  ...(meta.parentLabel
    ? [
        {
          key: 'parent',
          header: meta.parentLabel,
          cell: (r: LegacyRecord) => (r.parent_nama ? <span className="text-slate-600 dark:text-slate-300">{r.parent_nama}</span> : <Badge tone="warning">belum ditetapkan</Badge>),
          className: 'min-w-[200px]',
        } as Column<LegacyRecord>,
      ]
    : []),
  { key: 'id', header: 'Kode', cell: (r) => <span className={mono}>{r.id}</span>, hideBelow: 'xl' },
  { key: 'children', header: 'Turunan', align: 'right', cell: (r) => <span className={num}>{r.child_count}</span>, hideBelow: 'lg' },
  { key: 'users', header: 'Pengguna', align: 'right', cell: (r) => <span className={num}>{r.user_count}</span> },
];

/* ── Page ──────────────────────────────────────────────────────────────────── */
export function MasterData() {
  const [tab, setTab] = useState<TabKey>('provinsi');
  const meta = TAB_BY_KEY[tab];
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [reassigning, setReassigning] = useState<LegacyRecord | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [kotaFilter, setKotaFilter] = useState('');

  const provinsi = useFetch<ListResponse<ProvinsiRecord>>('/admin/master/provinsi');
  const kota = useFetch<ListResponse<KotaRecord>>(tab === 'kota' ? `/admin/master/kota${kotaFilter ? `?provinsi_id=${kotaFilter}` : ''}` : null);
  const legacy = useFetch<ListResponse<LegacyRecord>>(tab !== 'provinsi' && tab !== 'kota' ? `/admin/master/${tab}` : null);
  const active = tab === 'provinsi' ? provinsi : tab === 'kota' ? kota : legacy;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (active.data?.data ?? []) as Array<ProvinsiRecord | KotaRecord | LegacyRecord>;
    return q ? list.filter((r) => `${r.nama} ${'id' in r ? r.id : ''} ${'provinsi_nama' in r ? r.provinsi_nama : ''} ${'parent_nama' in r ? (r.parent_nama ?? '') : ''}`.toLowerCase().includes(q)) : list;
  }, [active.data, query]);

  const switchTab = (key: TabKey) => {
    setTab(key);
    setQuery('');
    setToast(null);
    setAdding(false);
    setReassigning(null);
  };
  const refreshAll = () => { provinsi.refetch(); kota.refetch(); legacy.refetch(); };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kelola Master Data"
        description="Data referensi wilayah dan struktur organisasi untuk antisipasi perluasan wilayah dan struktur."
        action={
          <button key={tab} type="button" onClick={() => setAdding(true)} className={primaryButtonClass}>
            <Plus className="h-4 w-4" /> Tambah {meta.singular}
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/70 p-1 scrollbar-thin dark:border-slate-800 dark:bg-slate-900">
        {TABS.map(({ key, tab: label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            aria-pressed={tab === key}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-300 ${tab === key ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {toast && (
        <div role="status" className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm animate-fade-in ${toast.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'}`}>
          {toast.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}{toast.text}
        </div>
      )}

      {/* Section header + toolbar */}
      <div key={tab} className="space-y-4 animate-fade-up">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-base font-semibold">{meta.title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{meta.description}{active.data ? ` · ${rows.length} dari ${active.data.total} data` : ''}</p>
          </div>
          <div className="flex w-full gap-2 md:w-auto">
            {tab === 'kota' && (
              <select value={kotaFilter} onChange={(e) => setKotaFilter(e.target.value)} className={`${inputClass} md:w-48`} aria-label="Filter provinsi">
                <option value="">Semua provinsi</option>
                {provinsi.data?.data.map((p) => <option key={p.id} value={p.id}>{p.nama}</option>)}
              </select>
            )}
            <div className="relative w-full md:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Cari ${meta.singular.toLowerCase()}…`} className={`${inputClass} pl-9`} />
            </div>
          </div>
        </div>

        {active.error ? (
          <ErrorState message={active.error} onRetry={active.refetch} />
        ) : active.loading && !active.data ? (
          <Skeleton className="h-72 rounded-xl" />
        ) : tab === 'provinsi' ? (
          <DataTable rows={rows as ProvinsiRecord[]} columns={provinsiColumns} rowKey={(r) => String(r.id)} emptyMessage={query ? 'Tidak ada provinsi yang cocok.' : 'Belum ada provinsi. Tambahkan dengan tombol di atas.'} />
        ) : tab === 'kota' ? (
          <DataTable rows={rows as KotaRecord[]} columns={kotaColumns} rowKey={(r) => String(r.id)} emptyMessage={query ? 'Tidak ada kota yang cocok.' : 'Belum ada kota. Tambahkan dengan tombol di atas.'} />
        ) : (
          <DataTable
            rows={rows as LegacyRecord[]}
            columns={legacyColumns(meta)}
            rowKey={(r) => r.id}
            emptyMessage={query ? `Tidak ada ${meta.singular.toLowerCase()} yang cocok.` : `Belum ada ${meta.singular.toLowerCase()}. Tambahkan dengan tombol di atas.`}
            actions={
              meta.parent
                ? (r) => (
                    <button type="button" onClick={() => setReassigning(r)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
                      Ubah induk
                    </button>
                  )
                : undefined
            }
          />
        )}
      </div>

      {reassigning && meta.parent && (
        <Modal title={`Ubah induk ${meta.singular}`} onClose={() => setReassigning(null)}>
          <ReassignForm meta={meta} row={reassigning} onCancel={() => setReassigning(null)} onDone={(msg) => { setReassigning(null); setToast({ tone: 'success', text: msg }); refreshAll(); }} />
        </Modal>
      )}
      {adding && (
        <Modal key={tab} title={`Tambah ${meta.singular}`} onClose={() => setAdding(false)}>
          <AddForm meta={meta} provinsi={provinsi.data?.data ?? []} onCancel={() => setAdding(false)} onDone={(msg) => { setAdding(false); setToast({ tone: 'success', text: msg }); refreshAll(); }} />
        </Modal>
      )}
    </div>
  );
}
