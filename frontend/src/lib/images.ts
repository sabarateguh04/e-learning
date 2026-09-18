/** Client-side image helpers for evidence photo uploads. */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Downscales a photo to at most 1600px on its longest side and re-encodes it as JPEG,
 * so 2-4 phone photos stay well under the server's 4 MB/photo limit. Falls back to the
 * original file when the browser cannot decode it.
 */
export async function compressImage(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 1_200_000) return original;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return original;
  }
}

/** Approximate decoded byte size of a base64 data URL. */
export const dataUrlBytes = (dataUrl: string) => Math.floor(((dataUrl.split(',')[1] ?? '').length * 3) / 4);

export const formatBytes = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
