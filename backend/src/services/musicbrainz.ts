import fetch from 'node-fetch';

const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';

function anyAbortSignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([a, b]);
  }
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (a.aborted || b.aborted) {
    ctrl.abort();
    return ctrl.signal;
  }
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return ctrl.signal;
}

export interface TrackMetadata {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  countryCode?: string;
  mbid?: string;
  artistMbid?: string;
}

interface MusicBrainzArtist {
  id?: string;
  name?: string;
  country?: string;
}

interface MusicBrainzArtistCredit {
  artist?: MusicBrainzArtist;
}

interface MusicBrainzRecording {
  id?: string;
  title?: string;
  'first-release-date'?: string;
  releases?: Array<{ date?: string }>;
  tags?: Array<{ name: string; count: number }>;
  'artist-credit'?: MusicBrainzArtistCredit[];
}

interface MusicBrainzSearchResponse {
  recordings?: MusicBrainzRecording[];
}

function extractYear(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const match = dateStr.match(/^(\d{4})/);
  if (!match) return undefined;
  const year = parseInt(match[1], 10);
  return Number.isFinite(year) ? year : undefined;
}

function pickGenre(tags?: Array<{ name: string; count: number }>): string | undefined {
  if (!tags?.length) return undefined;
  const sorted = [...tags].sort((a, b) => b.count - a.count);
  return sorted[0]?.name;
}

function pickYear(recording: MusicBrainzRecording): number | undefined {
  const fromRecording = extractYear(recording['first-release-date']);
  if (fromRecording) return fromRecording;

  for (const release of recording.releases ?? []) {
    const y = extractYear(release.date);
    if (y) return y;
  }

  return undefined;
}

function pickArtistMbid(recording: MusicBrainzRecording): string | undefined {
  return recording['artist-credit']?.[0]?.artist?.id;
}

function pickCountry(recording: MusicBrainzRecording): string | undefined {
  for (const credit of recording['artist-credit'] ?? []) {
    const code = credit.artist?.country?.trim().toUpperCase();
    if (code && /^[A-Z]{2}$/.test(code)) return code;
  }
  return undefined;
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = `${err.message} ${(err as NodeJS.ErrnoException).code ?? ''}`.toLowerCase();
  return msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket') ||
    msg.includes('network');
}

async function fetchRecordingSearch(
  artist: string,
  title: string,
  clientSignal?: AbortSignal,
): Promise<MusicBrainzRecording | null> {
  const query = encodeURIComponent(`artist:"${artist}" AND recording:"${title}"`);
  const url = `${MUSICBRAINZ_BASE}/recording?query=${query}&fmt=json&limit=5&inc=artist-credits`;
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (clientSignal?.aborted) return null;
    try {
      const timeout = AbortSignal.timeout(2_500);
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: clientSignal ? anyAbortSignal(clientSignal, timeout) : timeout,
      });

      if (!response.ok) {
        console.warn(`MusicBrainz HTTP ${response.status} for ${artist} — ${title}`);
        return null;
      }

      const data = (await response.json()) as MusicBrainzSearchResponse;
      return data.recordings?.[0] ?? null;
    } catch (err) {
      if (attempt < maxAttempts - 1 && isRetryableNetworkError(err)) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      console.warn(
        `MusicBrainz lookup failed for ${artist} — ${title}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  console.warn(`MusicBrainz lookup failed for ${artist} — ${title}`);
  return null;
}

/** Strip Yandex/streaming suffixes like «(из фильма «Форрест Гамп»)» before lookup. */
export function normalizeStreamingTitle(title: string): string {
  let t = title.trim();
  t = t.replace(/\s*\(из\s+фильма\s+[«"'].*?[»"']\)\s*$/iu, '').trim();
  t = t.replace(/\s*\(from\s+(?:the\s+)?(?:movie|film|soundtrack)\s+[^)]+\)\s*$/iu, '').trim();
  t = t.replace(/\s*\(из\s+сериала\s+[«"'].*?[»"']\)\s*$/iu, '').trim();
  return t || title.trim();
}

/**
 * Enriches artist/title with year and genre via MusicBrainz recording search.
 * Returns input fields unchanged when lookup fails.
 */
export async function enrichTrackMetadata(
  artist: string,
  title: string,
  clientSignal?: AbortSignal,
): Promise<TrackMetadata> {
  const lookupTitle = normalizeStreamingTitle(title);
  const base: TrackMetadata = { artist, title: lookupTitle };

  try {
    const recording = await fetchRecordingSearch(artist, lookupTitle, clientSignal);
    if (!recording) return base;

    return {
      artist,
      title: recording.title ?? lookupTitle,
      year: pickYear(recording),
      genre: pickGenre(recording.tags),
      countryCode: pickCountry(recording),
      mbid: recording.id,
      artistMbid: pickArtistMbid(recording),
    };
  } catch (err) {
    console.warn(
      `MusicBrainz enrich failed: ${err instanceof Error ? err.message : err}`,
    );
    return base;
  }
}
