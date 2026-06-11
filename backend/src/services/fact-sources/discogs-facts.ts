import type { HarvestContext, HarvestedFact } from './types.js';
import { cleanTrackTitle, fetchJson, splitSentences, stripHtml } from './fetch-utils.js';

const TOKEN = process.env.DISCOGS_TOKEN?.trim() ?? '';
const LASTFM_KEY = process.env.LASTFM_API_KEY?.trim() ?? '';

/** Discogs authenticated: 60 requests/minute. */
const MIN_INTERVAL_MS = 1100;
let lastCallAt = 0;

interface DiscogsSearchResult {
  results?: Array<{ id?: number; title?: string; type?: string; year?: string }>;
}

interface DiscogsRelease {
  title?: string;
  year?: string;
  notes?: string;
  genres?: string[];
  styles?: string[];
  labels?: Array<{ name?: string; catno?: string }>;
  tracklist?: Array<{ title?: string; position?: string; duration?: string }>;
}

const DISCOGS_JUNK =
  /(?:licensed from|manufactured by|distributed by|marketed by|phono copyright|copyright control|all rights reserved|for promotional use|not for sale|discogs\.com)/i;

function discogsHeaders(): Record<string, string> | null {
  if (!TOKEN) return null;
  return {
    Authorization: `Discogs token=${TOKEN}`,
    Accept: 'application/vnd.discogs.v2.discogs+json',
    'User-Agent': 'EfirAI/1.0 +https://efir-ai.ru',
  };
}

async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCallAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
  return fn();
}

async function resolveAlbumName(ctx: HarvestContext): Promise<string | null> {
  if (ctx.album?.trim()) return ctx.album.trim();
  if (!LASTFM_KEY) return null;
  const data = await fetchJson<{ track?: { album?: { title?: string } } }>(
    `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(ctx.artist)}&track=${encodeURIComponent(ctx.title)}&api_key=${LASTFM_KEY}&format=json&autocorrect=1`,
    { timeoutMs: 8000 },
  );
  return data?.track?.album?.title?.trim() ?? null;
}

function pickRelease(
  results: DiscogsSearchResult['results'],
  artist: string,
  album: string,
): number | null {
  if (!results?.length) return null;
  const artistLc = artist.toLowerCase();
  const albumLc = album.toLowerCase();
  const scored = results
    .filter((r) => r.type === 'release' && r.id)
    .map((r) => {
      const title = (r.title ?? '').toLowerCase();
      let score = 0;
      if (title.includes(artistLc)) score += 3;
      if (title.includes(albumLc)) score += 4;
      if (r.year) score += 1;
      return { id: r.id!, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 4 ? scored[0].id : results.find((r) => r.type === 'release')?.id ?? null;
}

function sentenceOk(sentence: string): boolean {
  const t = sentence.trim();
  if (t.length < 35 || t.length > 520) return false;
  if (DISCOGS_JUNK.test(t)) return false;
  if (/^\d{4}$/.test(t)) return false;
  return true;
}

export async function fetchDiscogsFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const headers = discogsHeaders();
  if (!headers) return [];

  const album = await resolveAlbumName(ctx);
  const queries = album
    ? [`${ctx.artist} ${album}`, `${ctx.artist} ${cleanTrackTitle(ctx.title)}`]
    : [`${ctx.artist} ${cleanTrackTitle(ctx.title)}`];

  let releaseId: number | null = null;
  for (const query of queries) {
    const search = await rateLimited(() =>
      fetchJson<DiscogsSearchResult>(
        `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=8`,
        { headers, timeoutMs: 12000 },
      ),
    );
    releaseId = pickRelease(search?.results, ctx.artist, album ?? ctx.title);
    if (releaseId) break;
  }
  if (!releaseId) return [];

  const release = await rateLimited(() =>
    fetchJson<DiscogsRelease>(`https://api.discogs.com/releases/${releaseId}`, {
      headers,
      timeoutMs: 12000,
    }),
  );
  if (!release) return [];

  const facts: HarvestedFact[] = [];
  const seen = new Set<string>();

  const push = (fact: string, scope: HarvestedFact['scope']) => {
    const key = fact.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({ fact, scope, source: 'discogs' });
  };

  const notes = release.notes?.trim();
  if (notes) {
    for (const sentence of splitSentences(stripHtml(notes))) {
      if (!sentenceOk(sentence)) continue;
      push(sentence, 'album');
      if (facts.length >= 6) break;
    }
  }

  if (facts.length < 4 && release.year && album) {
    const y = `Альбом «${album}» (${ctx.artist}) на Discogs датирован ${release.year} годом.`;
    if (sentenceOk(y)) push(y, 'album');
  }

  if (facts.length < 5 && release.labels?.length) {
    const label = release.labels[0]?.name?.trim();
    if (label && album) {
      const line = `Релиз «${album}» (${ctx.artist}) выходил на лейбле ${label}.`;
      if (sentenceOk(line)) push(line, 'album');
    }
  }

  const titleLc = cleanTrackTitle(ctx.title).toLowerCase();
  for (const tr of release.tracklist ?? []) {
    const trTitle = tr.title?.trim();
    if (!trTitle || trTitle.toLowerCase() !== titleLc) continue;
    if (tr.duration?.trim()) {
      const line = `На издании альбома «${release.title ?? album ?? ctx.title}» трек «${ctx.title}» идёт ${tr.duration.trim()}.`;
      if (sentenceOk(line)) push(line, 'track');
    }
    break;
  }

  return facts.slice(0, 8);
}
