import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface AnalyticsFilterValues {
  provinsi_id: string;
  kota_id: string;
  satker_id: string;
  from: string;
  to: string;
}

const KEYS: Array<keyof AnalyticsFilterValues> = ['provinsi_id', 'kota_id', 'satker_id', 'from', 'to'];

/**
 * Executive filters live in the URL (?provinsi_id=&kota_id=&satker_id=&from=&to=) so a
 * filtered dashboard is shareable and survives reloads. `query` is the encoded suffix
 * to append to any analytics/report/PDF request.
 */
export function useAnalyticsFilters() {
  const [params, setParams] = useSearchParams();

  const values = useMemo<AnalyticsFilterValues>(
    () => ({ provinsi_id: params.get('provinsi_id') ?? '', kota_id: params.get('kota_id') ?? '', satker_id: params.get('satker_id') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '' }),
    [params],
  );

  const set = useCallback(
    (patch: Partial<AnalyticsFilterValues>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          // Changing the provinsi invalidates a kota that belonged to the previous one.
          if ('provinsi_id' in patch && !('kota_id' in patch)) next.delete('kota_id');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clear = useCallback(() => setParams((prev) => { const next = new URLSearchParams(prev); KEYS.forEach((k) => next.delete(k)); return next; }, { replace: true }), [setParams]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    KEYS.forEach((k) => values[k] && q.set(k, values[k]));
    const s = q.toString();
    return s ? `?${s}` : '';
  }, [values]);

  const active = KEYS.filter((k) => values[k]).length;
  return { values, set, clear, query, active };
}
