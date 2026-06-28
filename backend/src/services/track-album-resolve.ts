import { fetchJson } from './fact-sources/fetch-utils.js';

const cache = new Map<string, { album: string | null; at: number }>();
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

/** Album name for a playing track — MediaSession hint, then Last.fm track.getInfo. */
export async function resolveTrackAlbumName(
  artist: string,
  title: string,
  albumHint?: string | null,
): Promise<string | null> {
  const hint = albumHint?.trim();
  if (hint) return hint;

  const key = cacheKey(artist, title);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.album;

  const lastfmKey = process.env.LASTFM_API_KEY?.trim();
  if (!lastfmKey) {
    cache.set(key, { album: null, at: Date.now() });
    return null;
  }

  try {
    const data = await fetchJson<{ track?: { album?: { title?: string } } }>(
      `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(title)}&api_key=${lastfmKey}&format=json&autocorrect=1`,
      { timeoutMs: 8000 },
    );
    const album = data?.track?.album?.title?.trim() ?? null;
    cache.set(key, { album, at: Date.now() });
    return album;
  } catch {
    cache.set(key, { album: null, at: Date.now() });
    return null;
  }
}
