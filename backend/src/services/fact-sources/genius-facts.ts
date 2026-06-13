import type { HarvestContext, HarvestedFact } from './types.js';
import { artistsMatchForHarvest } from '../artist-search-aliases.js';
import { cleanTrackTitle, domToPlainText, fetchJson, splitSentences, stripHtml } from './fetch-utils.js';
import { expandArtistSearchNames } from '../artist-search-aliases.js';

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

interface GeniusDomNode {
  tag?: string;
  children?: unknown[];
}

interface GeniusSongResponse {
  response?: {
    song?: {
      description?: { plain?: string; dom?: GeniusDomNode };
      description_annotation?: {
        annotations?: Array<{ body?: { plain?: string; dom?: GeniusDomNode } }>;
      };
    };
  };
}

function extractGeniusText(
  plain?: string,
  dom?: GeniusDomNode,
): string {
  const fromPlain = plain?.trim();
  if (fromPlain && fromPlain.length >= 35) return fromPlain;
  const fromDom = domToPlainText(dom).replace(/\s+/g, ' ').trim();
  return fromDom.length >= 35 ? fromDom : '';
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
  for (const hit of hits ?? []) {
    const result = hit.result;
    if (!result?.id) continue;
    const hitArtist = result.primary_artist?.name ?? '';
    const hitTitle = (result.title ?? '').toLowerCase();
    if (artistsMatchForHarvest(artist, hitArtist)) {
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

  const queryArtist =
    expandArtistSearchNames(ctx.artist).find((n) => n.length > 5 && !/^mgk$/i.test(n.trim())) ??
    ctx.artist;
  const query = `${queryArtist} ${cleanTrackTitle(ctx.title)}`.trim();
  const search = await fetchJson<GeniusSearchResponse>(
    `https://api.genius.com/search?q=${encodeURIComponent(query)}`,
    { headers, timeoutMs: 10_000 },
  );
  const songId = pickBestHit(search?.response?.hits, ctx.artist, ctx.title);
  if (!songId) return [];

  const song = await fetchJson<GeniusSongResponse>(
    `https://api.genius.com/songs/${songId}`,
    { headers, timeoutMs: 10_000 },
  );
  const facts: HarvestedFact[] = [];
  const songData = song?.response?.song;
  const descText = extractGeniusText(
    songData?.description?.plain,
    songData?.description?.dom,
  );
  if (descText) {
    for (const sentence of splitSentences(stripHtml(descText))) {
      facts.push({ fact: sentence, scope: 'track', source: 'genius' });
    }
  }
  const annotations = songData?.description_annotation?.annotations ?? [];
  for (const ann of annotations) {
    const annText = extractGeniusText(ann.body?.plain, ann.body?.dom);
    if (!annText) continue;
    for (const sentence of splitSentences(stripHtml(annText))) {
      facts.push({ fact: sentence, scope: 'track', source: 'genius' });
    }
  }
  return facts.slice(0, 6);
}
