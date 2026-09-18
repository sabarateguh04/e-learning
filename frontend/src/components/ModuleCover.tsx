import { useState } from 'react';
import { Play } from 'lucide-react';
import { moduleCoverUrl } from '../lib/video';

const GRADIENTS = [
  'from-sky-600 via-blue-700 to-indigo-900',
  'from-indigo-600 via-violet-700 to-slate-900',
  'from-teal-600 via-cyan-700 to-blue-900',
  'from-amber-500 via-orange-600 to-rose-800',
  'from-slate-700 via-slate-800 to-slate-950',
];
const gradientFor = (id: string) => GRADIENTS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % GRADIENTS.length];

/** Abstract road-safety illustration: perspective road, lane dashes, a shield and a traffic light. */
function RoadIllustration() {
  return (
    <svg viewBox="0 0 320 200" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f172a" stopOpacity="0" />
          <stop offset="1" stopColor="#020617" stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.15" r="0.6">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill="url(#glow)" />
      {/* road */}
      <path d="M135 200 L160 92 L185 200 Z" fill="#020617" opacity="0.55" />
      <path d="M100 200 L157 92 L163 92 L220 200 Z" fill="url(#road)" />
      <path d="M60 200 L150 92 L170 92 L260 200 Z" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.5" />
      {/* lane dashes */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={158.5 - i * 0.6} y={100 + i * 20 + i * i * 2} width={3 + i * 1.2} height={7 + i * 3} rx="1" fill="#facc15" opacity={0.9 - i * 0.12} />
      ))}
      {/* horizon line */}
      <line x1="0" y1="92" x2="320" y2="92" stroke="#ffffff" strokeOpacity="0.25" />
      {/* shield */}
      <g transform="translate(232 28)" opacity="0.9">
        <path d="M22 0 L44 8 V26 C44 42 33 52 22 58 C11 52 0 42 0 26 V8 Z" fill="#ffffff" fillOpacity="0.14" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.5" />
        <path d="M13 28 L20 35 L32 20" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* traffic light */}
      <g transform="translate(40 22)">
        <rect x="0" y="0" width="22" height="58" rx="6" fill="#0f172a" fillOpacity="0.6" stroke="#ffffff" strokeOpacity="0.35" />
        <circle cx="11" cy="12" r="5" fill="#ef4444" />
        <circle cx="11" cy="29" r="5" fill="#f59e0b" opacity="0.55" />
        <circle cx="11" cy="46" r="5" fill="#22c55e" opacity="0.55" />
        <rect x="9" y="58" width="4" height="26" fill="#ffffff" fillOpacity="0.3" />
      </g>
      {/* subtle grid */}
      <g stroke="#ffffff" strokeOpacity="0.06">
        {[40, 80, 120, 160, 200, 240, 280].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="92" />)}
        {[20, 46, 72].map((y) => <line key={y} x1="0" y1={y} x2="320" y2={y} />)}
      </g>
    </svg>
  );
}

/**
 * Media header for module cards: explicit thumbnail → YouTube poster → branded road-safety
 * illustration. A translucent play button marks modules that carry a video.
 */
export function ModuleCover({
  module: m,
  className = '',
  eager = false,
  children,
}: {
  module: { id: string; title: string; thumbnail_url: string | null; video_url: string | null };
  className?: string;
  eager?: boolean;
  children?: React.ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  const src = broken ? null : moduleCoverUrl(m);
  const hasVideo = Boolean(m.video_url);

  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${gradientFor(m.id)} ${className}`}>
      {src ? (
        <img
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <RoadIllustration />
      )}
      {/* legibility gradient for overlays */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-slate-950/10" />
      {hasVideo && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white shadow-lg ring-1 ring-white/40 backdrop-blur-md transition-transform duration-300 group-hover:scale-110">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
