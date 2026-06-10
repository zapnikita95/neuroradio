import type { HarvestContext, HarvestedFact } from './types.js';
import { cleanTrackTitle, fetchJson, splitSentences, stripHtml } from './fetch-utils.js';

const TOKEN = process.env.DISCOGS_TOKEN?.trim() ?? '';

interface DiscogsSearchResult {
  results?: Array<{ id?: number; title?: string; type?: string }>;
}

interface DiscogsRelease {
  notes?: string;
  tracklist?: Array<{ title?: string; position?: string }>;
}

function discogsHeaders(): Record<string, string> | null {
  if (!TOKEN) return null;
  return {
    Authorization: `Discogs token=${TOKEN}`,
    Accept: 'application/vnd.discogs.v2.discogs+json',
  };
}

export async function fetchDiscogsFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const headers = discogsHeaders();
  if (!headers) return [];

  const query = `${ctx.artist} ${cleanTrackTitle(ctx.title)}`;
  const search = await fetchJson<DiscogsSearchResult>(
    `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&per_page=3`,
    { headers, timeoutMs: 10000 },
  );
  const releaseId = search?.results?.find((r) => r.type === 'release')?.id;
  if (!releaseId) return [];

  const release = await fetchJson<DiscogsRelease>(
    `https://api.discogs.com/releases/${releaseId}`,
    { headers, timeoutMs: 10000 },
  );
  const facts: HarvestedFact[] = [];
  const notes = release?.notes?.trim();
  if (notes && notes.length >= 35) {
    for (const sentence of splitSentences(stripHtml(notes))) {
      facts.push({ fact: sentence, scope: 'album', source: 'discogs' });
    }
  }
  return facts.slice(0, 4);
}
