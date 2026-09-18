import { VideoOff } from 'lucide-react';
import { parseVideoSource } from '../lib/video';

/**
 * Renders a module video: YouTube (video or playlist) via privacy-enhanced iframe embed,
 * or a direct MP4 through the native player.
 */
export function VideoPlayer({ url, title, autoplay = false, poster, className = '' }: { url: string | null; title: string; autoplay?: boolean; poster?: string | null; className?: string }) {
  const src = parseVideoSource(url, { autoplay });
  if (!src) {
    return (
      <div className={`flex h-full w-full flex-col items-center justify-center gap-2 text-slate-400 ${className}`}>
        <VideoOff className="h-8 w-8" />
        <p className="text-sm">Tidak ada video untuk materi ini.</p>
      </div>
    );
  }
  if (src.kind === 'youtube') {
    return (
      <iframe
        key={src.embedUrl}
        src={src.embedUrl}
        title={title}
        className={`h-full w-full ${className}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    );
  }
  return (
    <video key={src.url} controls autoPlay={autoplay} preload="metadata" poster={poster ?? undefined} className={`h-full w-full ${className}`}>
      <source src={src.url} type="video/mp4" />
      Browser Anda tidak mendukung pemutaran video.
    </video>
  );
}
