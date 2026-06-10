import type { HarvestContext, HarvestedFact } from './types.js';
import { fetchJson, splitSentences, stripHtml } from './fetch-utils.js';

const API_KEY = process.env.LASTFM_API_KEY?.trim() ?? '';

interface LastFmArtistInfo {
  artist?: {
    name?: string;
    bio?: { content?: string; summary?: string };
    wiki?: { content?: string; summary?: string };
  };
}

export async function fetchLastfmFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  if (!API_KEY) return [];

  const data = await fetchJson<LastFmArtistInfo>(
    `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(ctx.artist)}&api_key=${API_KEY}&format=json`,
    { timeoutMs: 8000 },
  );
  const raw =
    data?.artist?.bio?.content?.trim() ||
    data?.artist?.bio?.summary?.trim() ||
    data?.artist?.wiki?.content?.trim() ||
    data?.artist?.wiki?.summary?.trim();
  if (!raw) return [];

  const cleaned = stripHtml(raw.replace(/<a href="[^"]*">Read more on Last\.fm<\/a>/gi, ''));
  const facts: HarvestedFact[] = [];
  for (const sentence of splitSentences(cleaned)) {
    facts.push({ fact: sentence, scope: 'artist', source: 'lastfm' });
  }
  return facts.slice(0, 5);
}
