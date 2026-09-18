import type { ReactNode } from 'react';

/**
 * Responsive data table.
 *  - ≥ md: a real table inside `w-full overflow-x-auto`; the action column is sticky on the right
 *    with its own background, so buttons are never cut off or pushed off-screen.
 *  - < md: each row becomes a card with label/value pairs and the actions in a footer row.
 */
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Extra classes for the <td> (e.g. text-right, w-40, max-w-[240px]) */
  className?: string;
  /** Hide this column on the table view below the given breakpoint (card view always shows it). */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  /** Show this column as the card title on mobile. */
  primary?: boolean;
  align?: 'left' | 'right' | 'center';
}

const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  actions,
  actionsHeader = 'Aksi',
  emptyMessage = 'Tidak ada data.',
  dense = false,
  className = '',
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  actions?: (row: T) => ReactNode;
  actionsHeader?: ReactNode;
  emptyMessage?: string;
  dense?: boolean;
  className?: string;
}) {
  const th = `px-4 ${dense ? 'py-2' : 'py-3'} text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500`;
  const td = `px-4 ${dense ? 'py-2' : 'py-3'} align-middle`;
  const stickyBg = 'bg-white group-hover:bg-slate-50 dark:bg-slate-900 dark:group-hover:bg-slate-800/60';
  const primary = columns.find((c) => c.primary) ?? columns[0];

  if (rows.length === 0) {
    return <div className={`rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 ${className}`}>{emptyMessage}</div>;
  }

  return (
    <div className={`w-full rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {/* ── Table (md and up) ─────────────────────────────────────────────── */}
      <div className="hidden w-full overflow-x-auto scrollbar-thin md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`${th} ${ALIGN[c.align ?? 'left']} ${c.hideBelow ? HIDE[c.hideBelow] : ''} ${c.className?.includes('w-') ? '' : ''}`}>
                  {c.header}
                </th>
              ))}
              {actions && <th scope="col" className={`${th} sticky right-0 z-10 bg-white text-right shadow-[-8px_0_12px_-10px_rgb(15_23_42/0.25)] dark:bg-slate-900`}>{actionsHeader}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => (
              <tr key={rowKey(row)} className="group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
                {columns.map((c) => (
                  <td key={c.key} className={`${td} ${ALIGN[c.align ?? 'left']} ${c.hideBelow ? HIDE[c.hideBelow] : ''} ${c.className ?? ''}`}>
                    {c.cell(row)}
                  </td>
                ))}
                {actions && (
                  <td className={`${td} sticky right-0 z-10 whitespace-nowrap text-right shadow-[-8px_0_12px_-10px_rgb(15_23_42/0.25)] ${stickyBg}`}>
                    <div className="flex items-center justify-end gap-1.5">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Cards (below md) ─────────────────────────────────────────────── */}
      <ul className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
        {rows.map((row) => (
          <li key={rowKey(row)} className="space-y-2.5 p-4">
            <div className="text-sm font-medium">{primary.cell(row)}</div>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-xs">
              {columns
                .filter((c) => c !== primary)
                .map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-slate-500 dark:text-slate-400">{c.header}</dt>
                    <dd className="min-w-0 text-right">{c.cell(row)}</dd>
                  </div>
                ))}
            </dl>
            {actions && <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">{actions(row)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
