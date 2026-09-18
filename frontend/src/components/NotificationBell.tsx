import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ClipboardCheck, Inbox, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import type { AppNotification } from '../types';

const POLL_MS = 60_000;
const timeAgo = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

/**
 * Topbar bell: unread badge (polled), dropdown with the latest notifications,
 * click-through to the linked page (marks the item read), and "mark all read".
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const { data } = await api.get<{ unread: number }>('/notifications/unread-count');
      setUnread(data.unread);
    } catch {
      /* transient — badge simply keeps its last value */
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ unread: number; data: AppNotification[] }>('/notifications');
      setItems(data.data);
      setUnread(data.unread);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll the unread count; also refresh when the tab regains focus.
  useEffect(() => {
    const first = window.setTimeout(refreshCount, 0);
    const id = window.setInterval(refreshCount, POLL_MS);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshCount]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read_at) {
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? null);
      setUnread((u) => Math.max(0, u - 1));
      api.patch(`/notifications/${n.id}/read`).catch(() => undefined);
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    setItems((list) => list?.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })) ?? null);
    setUnread(0);
    api.post('/notifications/read-all').catch(() => undefined);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        aria-label={unread ? `${unread} notifikasi belum dibaca` : 'Notifikasi'}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-900">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-fade-up dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <p className="text-sm font-semibold">Notifikasi</p>
            <button type="button" onClick={markAll} disabled={!unread} className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline dark:text-brand-400">
              <CheckCheck className="h-3.5 w-3.5" /> Tandai semua dibaca
            </button>
          </div>
          <ul className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {loading && !items ? (
              <li className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></li>
            ) : !items?.length ? (
              <li className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                <Inbox className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                Belum ada notifikasi.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openItem(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${n.read_at ? '' : 'bg-brand-50/60 dark:bg-brand-900/20'}`}
                  >
                    <span className={`mt-0.5 rounded-lg p-1.5 ${n.read_at ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200'}`}>
                      <ClipboardCheck className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-sm leading-snug ${n.read_at ? 'font-medium text-slate-700 dark:text-slate-200' : 'font-semibold'}`}>{n.title}</span>
                        {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Belum dibaca" />}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500 dark:text-slate-400">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-slate-400">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
