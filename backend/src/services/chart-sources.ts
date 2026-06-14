import fetch from '../proxy-fetch.js';
import { primaryHarvestLookupTitle } from './title-harvest-variants.js';

export interface ChartTrack {
  artist: string;
  title: string;
  rank: number;
  chartId: string;
  chartLabel: string;
}

const LASTFM_KEY = process.env.LASTFM_API_KEY?.trim() ?? '';

async function fetchJson<T>(
  url: string,
  headers?: Record<string, string>,
  label = 'chart',
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      console.warn(`[chart] ${label} HTTP ${res.status}: ${body}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[chart] ${label} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function normalizeChartTrack(
  artist: string,
  title: string,
  rank: number,
  chartId: string,
  chartLabel: string,
): ChartTrack | null {
  const a = artist?.trim();
  const t = primaryHarvestLookupTitle(title?.trim() ?? '');
  if (!a || !t || t.length < 2) return null;
  return { artist: a, title: t, rank, chartId, chartLabel };
}

async function fetchLastFmMethod(params: Record<string, string>, label: string): Promise<unknown> {
  if (!LASTFM_KEY) {
    console.warn(`[chart] ${label}: LASTFM_API_KEY missing`);
    return null;
  }
  const q = new URLSearchParams({ ...params, api_key: LASTFM_KEY, format: 'json' });
  const data = await fetchJson<Record<string, unknown>>(
    `https://ws.audioscrobbler.com/2.0/?${q}`,
    undefined,
    label,
  );
  if (!data) return null;
  if (typeof data.error === 'number') {
    console.warn(`[chart] ${label} Last.fm error ${data.error}: ${String(data.message ?? '')}`);
    return null;
  }
  return data;
}

export async function fetchLastfmGlobalChart(limit = 100): Promise<ChartTrack[]> {
  const data = (await fetchLastFmMethod(
    { method: 'chart.gettoptracks', limit: String(limit) },
    'lastfm-global',
  )) as { tracks?: { track?: Array<{ name?: string; artist?: { name?: string; '#text'?: string } }> } };
  const tracks = (data?.tracks?.track ?? [])
    .map((t, i) =>
      normalizeChartTrack(
        t.artist?.name ?? t.artist?.['#text'] ?? '',
        t.name ?? '',
        i + 1,
        'lastfm-global',
        'Last.fm Global',
      ),
    )
    .filter((t): t is ChartTrack => t !== null);
  console.log(`[chart] lastfm-global: ${tracks.length} tracks`);
  return tracks;
}

/** Last.fm geo chart — country must be ISO 3166-1 name (e.g. Russian Federation, not Russia). */
export async function fetchLastfmGeoChart(country: string, limit = 100): Promise<ChartTrack[]> {
  const data = (await fetchLastFmMethod(
    { method: 'geo.gettoptracks', country, limit: String(limit) },
    `lastfm-geo-${country}`,
  )) as { tracks?: { track?: Array<{ name?: string; artist?: { name?: string; '#text'?: string } }> } };
  const chartId = `lastfm-geo-${country.toLowerCase().replace(/\s+/g, '-')}`;
  const tracks = (data?.tracks?.track ?? [])
    .map((t, i) =>
      normalizeChartTrack(
        t.artist?.name ?? t.artist?.['#text'] ?? '',
        t.name ?? '',
        i + 1,
        chartId,
        `Last.fm ${country}`,
      ),
    )
    .filter((t): t is ChartTrack => t !== null);
  console.log(`[chart] ${chartId}: ${tracks.length} tracks`);
  return tracks;
}

export async function fetchItunesChart(country: string, limit = 100): Promise<ChartTrack[]> {
  const chartId = `itunes-${country}`;
  const data = await fetchJson<{
    feed?: { results?: Array<{ artistName?: string; name?: string }> };
  }>(
    `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/${limit}/songs.json`,
    undefined,
    chartId,
  );
  const tracks = (data?.feed?.results ?? [])
    .map((t, i) =>
      normalizeChartTrack(t.artistName ?? '', t.name ?? '', i + 1, chartId, `iTunes ${country.toUpperCase()}`),
    )
    .filter((t): t is ChartTrack => t !== null);
  console.log(`[chart] ${chartId}: ${tracks.length} tracks`);
  return tracks;
}

export async function fetchDeezerGlobalChart(limit = 100): Promise<ChartTrack[]> {
  const data = await fetchJson<{ data?: Array<{ title?: string; artist?: { name?: string } }> }>(
    `https://api.deezer.com/chart/0/tracks?limit=${limit}`,
    undefined,
    'deezer-global',
  );
  const tracks = (data?.data ?? [])
    .map((t, i) =>
      normalizeChartTrack(t.artist?.name ?? '', t.title ?? '', i + 1, 'deezer-global', 'Deezer Global'),
    )
    .filter((t): t is ChartTrack => t !== null);
  console.log(`[chart] deezer-global: ${tracks.length} tracks`);
  return tracks;
}

async function fetchDeezerPlaylist(
  playlistId: string,
  chartId: string,
  chartLabel: string,
  limit = 100,
): Promise<ChartTrack[]> {
  const data = await fetchJson<{
    data?: Array<{ title?: string; artist?: { name?: string } }>;
    error?: { message?: string };
  }>(
    `https://api.deezer.com/playlist/${playlistId}/tracks?limit=${limit}`,
    undefined,
    chartId,
  );
  if (data?.error?.message) {
    console.warn(`[chart] ${chartId} Deezer error: ${data.error.message}`);
    return [];
  }
  const tracks = (data?.data ?? [])
    .map((t, i) =>
      normalizeChartTrack(t.artist?.name ?? '', t.title ?? '', i + 1, chartId, chartLabel),
    )
    .filter((t): t is ChartTrack => t !== null);
  console.log(`[chart] ${chartId}: ${tracks.length} tracks`);
  return tracks;
}

export async function fetchDeezerTopRussiaChart(limit = 100): Promise<ChartTrack[]> {
  return fetchDeezerPlaylist('1116189381', 'deezer-top-russia', 'Deezer Top Russia', limit);
}

export async function fetchDeezerTopWorldwideChart(limit = 100): Promise<ChartTrack[]> {
  return fetchDeezerPlaylist('3155776842', 'deezer-top-worldwide', 'Deezer Top Worldwide', limit);
}

let spotifyToken: { token: string; expiresAt: number } | null = null;

function resolveSpotifyClientSecret(): string {
  return (
    process.env.SPOTIFY_SECRET?.trim() ||
    process.env.SPOTIFY_CLIENT_SECRET?.trim() ||
    ''
  );
}

/** Spotify playlist charts require Premium on the app owner account (403 since 2024). Kept for diagnostics. */
async function getSpotifyToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = resolveSpotifyClientSecret();
  if (!id || !secret) {
    console.warn('[chart] spotify: SPOTIFY_CLIENT_ID or SPOTIFY_SECRET missing');
    return null;
  }
  if (spotifyToken && Date.now() < spotifyToken.expiresAt - 60_000) return spotifyToken.token;

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.warn(`[chart] spotify token HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    console.warn('[chart] spotify token: empty access_token');
    return null;
  }
  spotifyToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return spotifyToken.token;
}

async function fetchSpotifyPlaylist(
  playlistId: string,
  chartId: string,
  chartLabel: string,
  limit = 50,
): Promise<ChartTrack[]> {
  const token = await getSpotifyToken();
  if (!token) return [];
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&fields=items(track(name,artists(name)))`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    console.warn(`[chart] ${chartId} Spotify HTTP ${res.status}: ${body}`);
    if (res.status === 403 && body.includes('premium')) {
      console.warn(
        `[chart] ${chartId}: Spotify requires Premium on app owner — use Deezer sources instead`,
      );
    }
    return [];
  }
  const data = (await res.json()) as {
    items?: Array<{ track?: { name?: string; artists?: Array<{ name?: string }> } | null }>;
  };
  const tracks = (data?.items ?? [])
    .map((item, i) => {
      const track = item.track;
      if (!track?.name) return null;
      const artist = track.artists?.map((a) => a.name).filter(Boolean).join(', ') ?? '';
      return normalizeChartTrack(artist, track.name, i + 1, chartId, chartLabel);
    })
    .filter((t): t is ChartTrack => t !== null);
  console.log(`[chart] ${chartId}: ${tracks.length} tracks`);
  return tracks;
}

export async function fetchSpotifyTop50Russia(): Promise<ChartTrack[]> {
  return fetchSpotifyPlaylist('37i9dQZEVXbO823pVmAHUL', 'spotify-top50-ru', 'Spotify Top 50 Russia');
}

export async function fetchSpotifyTop50Global(): Promise<ChartTrack[]> {
  return fetchSpotifyPlaylist('37i9dQZF1DXcBWIGoYBM5M', 'spotify-top50-global', 'Spotify Top 50 Global');
}

export async function fetchSpotifyViral50Global(): Promise<ChartTrack[]> {
  return fetchSpotifyPlaylist('37i9dQZF1DX0XUsuxWHRQd', 'spotify-viral50-global', 'Spotify Viral 50 Global');
}

export interface ChartSource {
  id: string;
  label: string;
  priority: number;
  fetch: () => Promise<ChartTrack[]>;
}

/** ≥6 charts: RU priority + international. Spotify replaced with Deezer (Spotify 403 without owner Premium). */
export const WEEKLY_CHART_SOURCES: ChartSource[] = [
  {
    id: 'lastfm-geo-russia',
    label: 'Last.fm Russia',
    priority: 1,
    fetch: () => fetchLastfmGeoChart('Russian Federation', 100),
  },
  { id: 'itunes-ru', label: 'iTunes Russia', priority: 1, fetch: () => fetchItunesChart('ru', 100) },
  { id: 'deezer-top-russia', label: 'Deezer Top Russia', priority: 1, fetch: fetchDeezerTopRussiaChart },
  { id: 'lastfm-global', label: 'Last.fm Global', priority: 2, fetch: () => fetchLastfmGlobalChart(100) },
  { id: 'itunes-us', label: 'iTunes US', priority: 2, fetch: () => fetchItunesChart('us', 100) },
  { id: 'deezer-global', label: 'Deezer Global', priority: 2, fetch: () => fetchDeezerGlobalChart(100) },
  { id: 'deezer-top-worldwide', label: 'Deezer Top Worldwide', priority: 2, fetch: fetchDeezerTopWorldwideChart },
];

export function chartTrackKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}
