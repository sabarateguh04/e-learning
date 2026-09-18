import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from './api';

interface Settled<T> {
  key: string; // url + refetch tick that produced this result
  url: string; // url that produced this result
  data: T | null;
  error: string | null;
}

/**
 * Minimal GET hook with abort-on-unmount and manual refetch.
 * `url` change triggers a new request; pass `null` to skip.
 *
 * Data semantics (important for cascading dropdowns):
 *  - same URL, refetch in flight  -> previous data is kept (no flicker on lists)
 *  - URL changed / URL is null    -> data is null until the new request settles,
 *    so a child select never shows the previous parent's children.
 * `loading` is derived (settled key ≠ requested key), so no setState runs inside the effect.
 */
export function useFetch<T>(url: string | null) {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ key: '', url: '', data: null, error: null });

  const requestKey = url ? `${url}#${tick}` : '';

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();

    api
      .get<T>(url, { signal: controller.signal })
      .then(({ data }) => setSettled({ key: requestKey, url, data, error: null }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setSettled({ key: requestKey, url, data: null, error: getErrorMessage(err) });
      });

    return () => controller.abort();
  }, [url, requestKey]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  const loading = Boolean(url) && settled.key !== requestKey;
  const sameUrl = Boolean(url) && settled.url === url;

  return {
    data: sameUrl ? settled.data : null,
    error: loading || !sameUrl ? null : settled.error,
    loading,
    refetch,
  };
}
