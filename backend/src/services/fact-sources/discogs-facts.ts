import type { HarvestContext, HarvestedFact } from './types.js';
import { cleanTrackTitle, fetchJson, splitSentences, stripHtml } from './fetch-utils.js';
import { harvestTitleVariants } from '../title-harvest-variants.js';

const TOKEN = process.env.DISCOGS_TOKEN?.trim() ?? '';
const LASTFM_KEY = process.env.LASTFM_API_KEY?.trim() ?? '';

/** Discogs authenticated: 60 requests/minute — paced via harvest-rate-limiter in fetchJson. */

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

interface DiscogsArtist {
  name?: string;
  profile?: string;
}

const DISCOGS_JUNK =
  /(?:licensed from|manufactured by|distributed by|marketed by|phono copyright|copyright control|all rights reserved|for promotional use|not for sale|discogs\.com)/i;

function discogsHeaders(): Record<string, string> | null {
  if (!TOKEN) {
    console.warn('[discogs] DISCOGS_TOKEN not set — artist/release facts disabled');
    return null;
  }
  return {
    Authorization: `Discogs token=${TOKEN}`,
    Accept: 'application/vnd.discogs.v2.discogs+json',
    'User-Agent': 'EfirAI/1.0 +https://efir-ai.ru',
  };
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

function normalizeArtistName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function pickArtistId(
  results: DiscogsSearchResult['results'],
  artist: string,
): number | null {
  if (!results?.length) return null;
  const target = normalizeArtistName(artist);
  const scored = results
    .filter((r) => r.type === 'artist' && r.id)
    .map((r) => {
      const title = normalizeArtistName(r.title ?? '');
      let score = 0;
      if (title === target) score += 10;
      else if (title.includes(target) || target.includes(title)) score += 5;
      return { id: r.id!, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 5 ? scored[0].id : null;
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

function normalizeTrackTitleForMatch(title: string): string {
  return title
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/\bnobodies\b/g, 'nobodys')
    .replace(/\s+/g, ' ')
    .trim();
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
    const search = await fetchJson<DiscogsSearchResult>(
      `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=8`,
      { headers, timeoutMs: 12000 },
    );
    releaseId = pickRelease(search?.results, ctx.artist, album ?? ctx.title);
    if (releaseId) break;
  }
  if (!releaseId) return [];

  const release = await fetchJson<DiscogsRelease>(`https://api.discogs.com/releases/${releaseId}`, {
    headers,
    timeoutMs: 12000,
  });
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

  const titleVariants = new Set(
    harvestTitleVariants(ctx.title).map((variant) => normalizeTrackTitleForMatch(variant)),
  );
  let matchedTrack = false;
  for (const tr of release.tracklist ?? []) {
    const trTitle = tr.title?.trim();
    if (!trTitle || !titleVariants.has(normalizeTrackTitleForMatch(trTitle))) continue;
    matchedTrack = true;
    if (tr.duration?.trim()) {
      const line = `На издании альбома «${release.title ?? album ?? ctx.title}» трек «${ctx.title}» идёт ${tr.duration.trim()}.`;
      if (sentenceOk(line)) push(line, 'track');
    }
    break;
  }

  if (matchedTrack && notes) {
    for (const sentence of splitSentences(stripHtml(notes))) {
      if (!sentenceOk(sentence)) continue;
      if (!/\b(?:recorded|mixed|mastered|studio|produced)\b/i.test(sentence)) continue;
      if (/\bUses:\s/i.test(sentence)) continue;
      const gearHits = (sentence.match(/\b(?:Guitars?|Amps?|Cymbals?|Strings?|Wireless)\b/gi) ?? []).length;
      if (gearHits >= 2) continue;
      const line = `Трек «${ctx.title}» вошёл в альбом «${release.title ?? album ?? ctx.title}»: ${sentence}`;
      if (sentenceOk(line) && line.length <= 220) push(line, 'track');
      if (facts.filter((f) => f.scope === 'track').length >= 3) break;
    }
  }

  return facts.slice(0, 8);
}

/** Профиль группы/артиста на Discogs — быстрый fallback, если по треку/релизу пусто. */
export async function fetchDiscogsArtistFacts(artist: string): Promise<HarvestedFact[]> {
  const headers = discogsHeaders();
  if (!headers) return [];

  const search = await fetchJson<DiscogsSearchResult>(
    `https://api.discogs.com/database/search?q=${encodeURIComponent(artist)}&type=artist&per_page=8`,
    { headers, timeoutMs: 12000 },
  );
  const artistId = pickArtistId(search?.results, artist);
  if (!artistId) return [];

  const profileData = await fetchJson<DiscogsArtist>(`https://api.discogs.com/artists/${artistId}`, {
    headers,
    timeoutMs: 12000,
  });
  const profile = profileData?.profile?.trim();
  if (!profile) return [];

  const facts: HarvestedFact[] = [];
  const seen = new Set<string>();
  for (const sentence of splitSentences(stripHtml(profile))) {
    if (!sentenceOk(sentence)) continue;
    const key = sentence.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ fact: sentence, scope: 'artist', source: 'discogs' });
    if (facts.length >= 4) break;
  }

  if (facts.length === 0 && profile.length >= 35) {
    const trimmed = profile.replace(/\s+/g, ' ').trim().slice(0, 480);
    if (sentenceOk(trimmed)) {
      facts.push({ fact: trimmed, scope: 'artist', source: 'discogs' });
    }
  }

  return facts;
}

/**
 * Live path: релиз (трек/альбом) + профиль артиста, если по релизу ничего не нашли.
 * ~3–6 с при наличии DISCOGS_TOKEN.
 */
export async function fetchDiscogsLiveFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const releaseFacts = await fetchDiscogsFacts(ctx);
  if (releaseFacts.length > 0) return releaseFacts.slice(0, 8);
  const artistFacts = await fetchDiscogsArtistFacts(ctx.artist);
  return artistFacts.slice(0, 6);
}
