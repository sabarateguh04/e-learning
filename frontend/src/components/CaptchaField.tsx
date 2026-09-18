import { RefreshCw } from 'lucide-react';
import type { useCaptcha } from '../lib/useCaptcha';

/**
 * Compact, fixed-geometry captcha row: [ Berapakah 4 + 7 ? ] [ jawaban ] [↻]
 * Operands are single digits (server-side), so the question box never grows and the
 * surrounding grid/flex layout stays put.
 */
export function CaptchaField({
  captcha,
  value,
  onChange,
  error,
  idPrefix = '',
}: {
  captcha: ReturnType<typeof useCaptcha>;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  idPrefix?: string;
}) {
  if (!captcha.required) return null;
  const { fetch } = captcha;
  return (
    <div className="space-y-1.5">
      <label htmlFor={`${idPrefix}captcha`} className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
        Captcha
      </label>
      <div className="flex h-11 w-full items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15 dark:border-slate-800 dark:bg-slate-950 dark:focus-within:border-brand-400">
        <div key={captcha.id ?? 'loading'} className="flex min-w-0 flex-1 items-center gap-2 border-r border-slate-200 bg-slate-50 px-3 text-sm dark:border-slate-800 dark:bg-slate-900" aria-live="polite">
          <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">Berapakah</span>
          <span className="whitespace-nowrap font-mono text-base font-semibold tabular-nums tracking-wider text-slate-900 dark:text-white animate-fade-in">
            {fetch.loading ? '· · ·' : fetch.error ? '—' : (captcha.question ?? '—')}
          </span>
          <span className="text-slate-500 dark:text-slate-400">?</span>
        </div>
        <input
          id={`${idPrefix}captcha`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
          placeholder="Jawab"
          required
          aria-label="Jawaban captcha"
          className="w-20 shrink-0 bg-transparent px-3 text-center font-mono text-base font-semibold tabular-nums text-slate-900 placeholder-slate-400 focus:outline-none dark:text-white dark:placeholder-slate-500"
        />
        <button
          type="button"
          onClick={() => { captcha.reset(); onChange(''); }}
          aria-label="Muat captcha baru"
          title="Muat captcha baru"
          className="flex w-11 shrink-0 items-center justify-center border-l border-slate-200 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-90 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 ${fetch.loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
