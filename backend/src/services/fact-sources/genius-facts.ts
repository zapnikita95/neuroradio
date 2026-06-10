import type { HarvestContext, HarvestedFact } from './types.js';
import { cleanTrackTitle, fetchJson, splitSentences, stripHtml } from './fetch-utils.js';

const TOKEN = process.env.GENIUS_ACCESS_TOKEN?.trim() ?? '';

interface GeniusSearchResponse {
  response?: {
    hits?: Array<{
      result?: {
        id?: number;
        title?: string;
        primary_artist?: { name?: string };
        annotation_count?: number;
      };
    }>;
  };
}

interface GeniusSongResponse {
  response?: {
    song?: {
      description?: { plain?: string };
      description_annotation?: { annotations?: Array<{ body?: { plain?: string } }> };
    };
  };
}

function geniusHeaders(): Record<string, string> | null {
  if (!TOKEN) return null;
  return { Authorization: `Bearer ${TOKEN}` };
}

function pickBestHit(
  hits: NonNullable<GeniusSearchResponse['response']>['hits'],
  artist: string,
  title: string,
): number | null {
  const cleanTitle = cleanTrackTitle(title).toLowerCase();
  const artistLower = artist.toLowerCase();
  for (const hit of hits ?? []) {
    const result = hit.result;
    if (!result?.id) continue;
    const hitArtist = (result.primary_artist?.name ?? '').toLowerCase();
    const hitTitle = (result.title ?? '').toLowerCase();
    if (hitArtist.includes(artistLower) || artistLower.includes(hitArtist)) {
      if (hitTitle.includes(cleanTitle) || cleanTitle.includes(hitTitle)) {
        return result.id;
      }
    }
  }
  return hits?.[0]?.result?.id ?? null;
}

export async function fetchGeniusFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const headers = geniusHeaders();
  if (!headers) return [];

  const query = `${ctx.artist} ${cleanTrackTitle(ctx.title)}`.trim();
  const search = await fetchJson<GeniusSearchResponse>(
    `https://api.genius.com/search?q=${encodeURIComponent(query)}`,
    { headers, timeoutMs: 8000 },
  );
  const songId = pickBestHit(search?.response?.hits, ctx.artist, ctx.title);
  if (!songId) return [];

  const song = await fetchJson<GeniusSongResponse>(
    `https://api.genius.com/songs/${songId}`,
    { headers, timeoutMs: 8000 },
  );
  const facts: HarvestedFact[] = [];
  const desc = song?.response?.song?.description?.plain?.trim();
  if (desc && desc.length >= 35) {
    for (const sentence of splitSentences(stripHtml(desc))) {
      facts.push({ fact: sentence, scope: 'track', source: 'genius' });
    }
  }
  const annotations = song?.response?.song?.description_annotation?.annotations ?? [];
  for (const ann of annotations) {
    const plain = ann.body?.plain?.trim();
    if (!plain || plain.length < 35) continue;
    for (const sentence of splitSentences(stripHtml(plain))) {
      facts.push({ fact: sentence, scope: 'track', source: 'genius' });
    }
  }
  return facts.slice(0, 6);
}
