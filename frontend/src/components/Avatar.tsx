import { useState } from 'react';
import { resolveAssetUrl } from '../lib/api';
import { initialsOf } from '../lib/text';

const SIZES = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg', xl: 'h-24 w-24 text-2xl' } as const;

/** Profile photo with initials fallback (also used when the image fails to load). */
export function Avatar({ name, src, size = 'md', className = '' }: { name?: string | null; src?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const [broken, setBroken] = useState(false);
  const url = src && !broken ? resolveAssetUrl(src) : null;

  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-sky-400 to-blue-600 font-bold text-white ring-2 ring-white dark:ring-slate-900 ${SIZES[size]} ${className}`} aria-label={name ?? 'User'}>
      {url ? <img src={url} alt={name ?? ''} className="h-full w-full object-cover" onError={() => setBroken(true)} /> : initialsOf(name)}
    </span>
  );
}
