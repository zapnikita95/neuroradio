import type { HarvestContext, HarvestedFact } from './types.js';
import { cleanTrackTitle, fetchJson } from './fetch-utils.js';

const API_KEY = process.env.SETLISTFM_API_KEY?.trim() ?? '';

interface SetlistSearchResponse {
  setlist?: Array<{
    eventDate?: string;
    venue?: { name?: string; city?: { name?: string; country?: { name?: string } } };
    sets?: { set?: Array<{ song?: Array<{ name?: string }> }> };
  }>;
}

export async function fetchSetlistfmFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  if (!API_KEY) return [];

  const cleanTitle = cleanTrackTitle(ctx.title);
  const data = await fetchJson<SetlistSearchResponse>(
    `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(ctx.artist)}&songName=${encodeURIComponent(cleanTitle)}&p=1`,
    {
      headers: { 'x-api-key': API_KEY, Accept: 'application/json' },
      timeoutMs: 10000,
    },
  );
  const setlists = data?.setlist ?? [];
  if (setlists.length === 0) return [];

  const oldest = setlists
    .filter((s) => s.eventDate)
    .sort((a, b) => (a.eventDate ?? '').localeCompare(b.eventDate ?? ''))[0];
  if (!oldest?.eventDate) return [];

  const venue = oldest.venue?.name ?? 'концерте';
  const city = oldest.venue?.city?.name ?? '';
  const country = oldest.venue?.city?.country?.name ?? '';
  const place = [venue, city, country].filter(Boolean).join(', ');
  const fact =
    `«${cleanTitle}» впервые прозвучала на живом выступлении ${ctx.artist} ` +
    `${oldest.eventDate}${place ? ` (${place})` : ''}.`;
  return [{ fact, scope: 'track', source: 'setlistfm' }];
}
