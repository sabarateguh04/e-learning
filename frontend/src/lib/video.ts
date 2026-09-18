/**
 * Video source helpers — modules may reference a direct MP4 or a YouTube video/playlist.
 * YouTube is rendered through the privacy-enhanced embed domain.
 */
export type VideoSource = { kind: 'youtube'; embedUrl: string; id: string } | { kind: 'file'; url: string } | null;

const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com'];

export function parseVideoSource(url: string | null | undefined, opts: { autoplay?: boolean } = {}): VideoSource {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!YT_HOSTS.includes(host)) return { kind: 'file', url };

  const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1', ...(opts.autoplay ? { autoplay: '1' } : {}) });
  const listId = u.searchParams.get('list');
  let videoId: string | null = null;

  if (host === 'youtu.be') videoId = u.pathname.slice(1).split('/')[0] || null;
  else if (u.pathname.startsWith('/watch')) videoId = u.searchParams.get('v');
  else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/') || u.pathname.startsWith('/live/')) videoId = u.pathname.split('/')[2] || null;

  if (videoId && /^[\w-]{6,}$/.test(videoId)) {
    if (listId) params.set('list', listId);
    return { kind: 'youtube', id: videoId, embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?${params}` };
  }
  if (listId) {
    params.set('list', listId);
    return { kind: 'youtube', id: listId, embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?${params}` };
  }
  return null;
}

export const isYouTubeUrl = (url: string | null | undefined) => parseVideoSource(url)?.kind === 'youtube';

/** Official poster frame for a YouTube video URL (null for playlists / non-YouTube sources). */
export function youtubeThumbnail(url: string | null | undefined, quality: 'hqdefault' | 'maxresdefault' | 'mqdefault' = 'hqdefault'): string | null {
  const src = parseVideoSource(url);
  if (!src || src.kind !== 'youtube' || src.embedUrl.includes('videoseries')) return null;
  return `https://img.youtube.com/vi/${src.id}/${quality}.jpg`;
}

/** Best available cover for a module card: explicit thumbnail, else the YouTube poster, else null. */
export const moduleCoverUrl = (m: { thumbnail_url: string | null; video_url: string | null }): string | null =>
  m.thumbnail_url || youtubeThumbnail(m.video_url);
