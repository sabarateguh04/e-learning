import type { AxiosResponse } from 'axios';

/**
 * Saves a Blob through a detached, hidden anchor. The object URL is kept alive
 * long enough for browsers that start the download asynchronously — revoking it
 * too early is what used to leave the tab on an empty `blob:` page.
 * Nothing here touches the React tree or the router, so the page stays mounted.
 */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Detach on the next tick, revoke well after the browser has claimed the bytes.
  window.setTimeout(() => a.remove(), 0);
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

/** Filename from a Content-Disposition header, or the fallback. */
export const filenameFrom = (res: AxiosResponse, fallback: string) => {
  const header = String(res.headers?.['content-disposition'] ?? '');
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? fallback;
};

/**
 * When the server answers an error to a `responseType: 'blob'` request, the body is a
 * Blob of JSON — decode it so the user sees the real message instead of "[object Blob]".
 */
export async function blobErrorMessage(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string };
      if (parsed?.message) return parsed.message;
    } catch {
      /* not JSON */
    }
  }
  const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ?? (err as { message?: string })?.message;
  return typeof msg === 'string' && msg ? msg : fallback;
}
