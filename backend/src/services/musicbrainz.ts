import fetch from 'node-fetch';

const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';

export interface TrackMetadata {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  countryCode?: string;
  mbid?: string;
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

function pickCountry(recording: MusicBrainzRecording): string | undefined {
  for (const credit of recording['artist-credit'] ?? []) {
    const code = credit.artist?.country?.trim().toUpperCase();
    if (code && /^[A-Z]{2}$/.test(code)) return code;
  }
  return undefined;
}

/**
 * Enriches artist/title with year and genre via MusicBrainz recording search.
 * Returns input fields unchanged when lookup fails.
 */
export async function enrichTrackMetadata(
  artist: string,
  title: string,
): Promise<TrackMetadata> {
  const base: TrackMetadata = { artist, title };

  try {
    const query = encodeURIComponent(`artist:"${artist}" AND recording:"${title}"`);
    const url = `${MUSICBRAINZ_BASE}/recording?query=${query}&fmt=json&limit=5&inc=artist-credits`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn(`MusicBrainz HTTP ${response.status} for ${artist} — ${title}`);
      return base;
    }

    const data = (await response.json()) as MusicBrainzSearchResponse;
    const recording = data.recordings?.[0];

    if (!recording) {
      return base;
    }

    return {
      artist,
      title: recording.title ?? title,
      year: pickYear(recording),
      genre: pickGenre(recording.tags),
      countryCode: pickCountry(recording),
      mbid: recording.id,
    };
  } catch (err) {
    console.warn('MusicBrainz lookup failed:', err);
    return base;
  }
}
