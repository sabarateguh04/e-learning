import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { ACCEPTED_IMAGE_TYPES, compressImage, dataUrlBytes, formatBytes } from '../lib/images';

/**
 * Multi-photo picker with thumbnails: enforces a min/max count, accepts JPEG/PNG/WebP,
 * compresses each file client-side, supports drag-and-drop and camera capture on mobile.
 */
export function PhotoPicker({
  value,
  onChange,
  min,
  max,
  disabled = false,
  error,
}: {
  value: string[];
  onChange: (photos: string[]) => void;
  min: number;
  max: number;
  disabled?: boolean;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const remaining = max - value.length;

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setLocalError(null);
    const rejected = list.filter((f) => !ACCEPTED_IMAGE_TYPES.includes(f.type));
    const accepted = list.filter((f) => ACCEPTED_IMAGE_TYPES.includes(f.type)).slice(0, Math.max(0, remaining));
    if (rejected.length) setLocalError(`${rejected.length} berkas dilewati — hanya JPEG, PNG, atau WebP.`);
    if (list.length > remaining) setLocalError((e) => `${e ? `${e} ` : ''}Maksimal ${max} foto; ${list.length - remaining} foto tidak ditambahkan.`);
    if (!accepted.length) return;
    setBusy(true);
    try {
      const encoded = await Promise.all(accepted.map(compressImage));
      onChange([...value, ...encoded]);
    } finally {
      setBusy(false);
    }
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled && remaining > 0) addFiles(e.dataTransfer.files);
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const countTone = value.length >= min && value.length <= max ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {value.map((src, i) => (
          <figure key={`${i}-${src.length}`} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
            <img src={src} alt={`Foto bukti ${i + 1}`} className="h-full w-full object-cover" />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-[10px] text-white">
              Foto {i + 1} · {formatBytes(dataUrlBytes(src))}
            </figcaption>
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-red-600 focus:opacity-100 group-hover:opacity-100"
                aria-label={`Hapus foto ${i + 1}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </figure>
        ))}

        {remaining > 0 && (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-xs transition-colors ${
              dragging
                ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200'
                : 'border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-brand-500'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : value.length ? <ImagePlus className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
            <span className="font-medium">{busy ? 'Memproses…' : value.length ? 'Tambah foto' : 'Pilih / ambil foto'}</span>
            <span className="text-[10px] opacity-70">sisa {remaining}</span>
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} multiple capture="environment" className="hidden" onChange={onInput} disabled={disabled} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className={countTone}>
          {value.length}/{max} foto{value.length < min ? ` · minimal ${min}` : ''}
        </span>
        <span className="text-slate-400">JPEG/PNG/WebP · dikompres otomatis ≤ 1600 px</span>
      </div>
      {(error || localError) && <p className="text-xs text-red-600 dark:text-red-400">{error ?? localError}</p>}
    </div>
  );
}
