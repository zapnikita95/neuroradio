import type { HarvestContext, HarvestedFact } from './types.js';
import { cleanTrackTitle, fetchJson } from './fetch-utils.js';

const API_KEY = process.env.MUSIXMATCH_API_KEY?.trim() ?? '';

interface MusixmatchTrackSearch {
  message?: {
    body?: {
      track_list?: Array<{
        track?: {
          track_name?: string;
          artist_name?: string;
          track_share_url?: string;
          updated_time?: string;
          first_release_date?: string;
          primary_genres?: { music_genre_list?: Array<{ music_genre?: { music_genre_name?: string } }> };
        };
      }>;
    };
  };
}

export async function fetchMusixmatchFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  if (!API_KEY) return [];

  const cleanTitle = cleanTrackTitle(ctx.title);
  const data = await fetchJson<MusixmatchTrackSearch>(
    `https://api.musixmatch.com/ws/1.1/track.search?q_artist=${encodeURIComponent(ctx.artist)}&q_track=${encodeURIComponent(cleanTitle)}&apikey=${API_KEY}&page_size=3`,
    { timeoutMs: 8000 },
  );
  const track = data?.message?.body?.track_list?.[0]?.track;
  if (!track) return [];

  const facts: HarvestedFact[] = [];
  const genres =
    track.primary_genres?.music_genre_list
      ?.map((g) => g.music_genre?.music_genre_name)
      .filter(Boolean)
      .join(', ') ?? '';
  if (track.first_release_date && genres) {
    facts.push({
      fact: `«${cleanTitle}» ${ctx.artist} — релиз ${track.first_release_date}, жанр: ${genres}.`,
      scope: 'track',
      source: 'musixmatch',
    });
  } else if (track.first_release_date) {
    facts.push({
      fact: `«${cleanTitle}» ${ctx.artist} впервые вышла ${track.first_release_date}.`,
      scope: 'track',
      source: 'musixmatch',
    });
  }
  return facts;
}
