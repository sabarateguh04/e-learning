import { useRef, useState } from 'react';
import { Camera, Link2, Loader2, Trash2, Upload } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Avatar } from './Avatar';
import { inputClass, primaryButtonClass, secondaryButtonClass } from './ui';

const MAX_EDGE = 512; // px — client-side downscale keeps uploads small (< 2 MB server limit)

/** Reads a File, downsizes it on a canvas and returns a JPEG/PNG data URL. */
async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return canvas.toDataURL(type, 0.88);
}

export function ProfilePhotoEditor({ name, photoUrl, onChanged }: { name: string; photoUrl: string | null; onChanged: (url: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const setPhoto = useAuthStore((s) => s.setPhoto);
  const [mode, setMode] = useState<'upload' | 'link'>('upload');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (url: string | null) => {
    setPhoto(url);
    onChanged(url);
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP image');
      const image = await fileToDataUrl(file);
      const { data } = await api.post<{ profile_photo_url: string }>('/auth/profile/photo', { image });
      apply(data.profile_photo_url);
    } catch (err) {
      setError(err instanceof Error && !('isAxiosError' in err) ? err.message : getErrorMessage(err, 'Upload failed.'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.put<{ data: { profile_photo_url: string | null } }>('/auth/profile', { profile_photo_url: link.trim() });
      apply(data.data.profile_photo_url);
      setLink('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the photo link.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.delete('/auth/profile/photo');
      apply(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove the photo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={name} src={photoUrl} size="xl" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">Foto profil</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Shown in the top bar and on your profile. PNG, JPEG or WebP, up to 2 MB.</p>
          <div className="flex gap-1 pt-1">
            {(['upload', 'link'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${mode === m ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-400'}`}
              >
                {m === 'upload' ? 'Upload file' : 'Use a link'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'upload' ? (
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={primaryButtonClass}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Choose image
          </button>
          {photoUrl && (
            <button type="button" onClick={remove} disabled={busy} className={secondaryButtonClass}><Trash2 className="h-4 w-4" /> Remove</button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/photo.jpg" className={`${inputClass} pl-10`} />
          </div>
          <button type="button" onClick={saveLink} disabled={busy || !link.trim()} className={primaryButtonClass}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Save link
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
