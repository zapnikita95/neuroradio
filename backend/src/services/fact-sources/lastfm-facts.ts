import { harvestTitleVariants } from '../title-harvest-variants.js';
import { expandArtistSearchNames } from '../artist-search-aliases.js';
import {
  isArtistDisambiguationListSeed,
  isArtistFormationBioSeed,
  isListeningStatsFact,
} from '../reference-fact-quality.js';
import { isArtistIdentityBioSnippet } from '../web-snippet-accept.js';
import type { HarvestContext, HarvestedFact } from './types.js';
import { fetchJson, splitSentences, stripHtml } from './fetch-utils.js';

const API_KEY = process.env.LASTFM_API_KEY?.trim() ?? '';

interface LastFmWikiBlock {
  content?: string;
  summary?: string;
}

interface LastFmArtistInfo {
  artist?: {
    name?: string;
    bio?: LastFmWikiBlock;
    wiki?: LastFmWikiBlock;
  };
}

interface LastFmTrackInfo {
  track?: {
    name?: string;
    wiki?: LastFmWikiBlock;
    album?: { title?: string };
    playcount?: string;
    listeners?: string;
  };
}

function wikiToSentences(raw: string | undefined, scope: 'track' | 'artist'): HarvestedFact[] {
  if (!raw?.trim()) return [];
  const cleaned = stripHtml(raw.replace(/<a href="[^"]*">Read more on Last\.fm<\/a>/gi, ''));
  return splitSentences(cleaned)
    .filter((sentence) => {
      const t = sentence.trim();
      if (t.length < 35) return false;
      if (isArtistDisambiguationListSeed(t)) return false;
      if (isListeningStatsFact(t)) return false;
      if (/debut single check/i.test(t)) return false;
      if (/Then the (?:first|second|third|fourth|lead|debut) single \w+/i.test(t)) return false;
      if (scope === 'artist' && isArtistIdentityBioSnippet(t)) return false;
      if (scope === 'artist' && isArtistFormationBioSeed(t) && !/\b(?:song|single|track|album|released|recorded)\b/i.test(t)) {
        return false;
      }
      return true;
    })
    .slice(0, 5)
    .map((fact) => ({ fact, scope, source: 'lastfm' as const }));
}

async function fetchArtistInfo(artist: string): Promise<HarvestedFact[]> {
  const data = await fetchJson<LastFmArtistInfo>(
    `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artist)}&api_key=${API_KEY}&format=json&autocorrect=1`,
    { timeoutMs: 8000 },
  );
  const raw =
    data?.artist?.bio?.content?.trim() ||
    data?.artist?.bio?.summary?.trim() ||
    data?.artist?.wiki?.content?.trim() ||
    data?.artist?.wiki?.summary?.trim();
  return wikiToSentences(raw, 'artist');
}

async function fetchTrackInfo(artist: string, title: string): Promise<HarvestedFact[]> {
  let track: LastFmTrackInfo['track'] | undefined;
  let resolvedTitle = title;
  let resolvedArtist = artist;
  outer: for (const artistName of expandArtistSearchNames(artist)) {
    for (const variant of harvestTitleVariants(title)) {
      const data = await fetchJson<LastFmTrackInfo>(
        `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(artistName)}&track=${encodeURIComponent(variant)}&api_key=${API_KEY}&format=json&autocorrect=1`,
        { timeoutMs: 8000 },
      );
      const candidate = data?.track;
      const wiki = candidate?.wiki?.content?.trim() || candidate?.wiki?.summary?.trim();
      if (wiki || candidate?.listeners || candidate?.album?.title) {
        track = candidate;
        resolvedTitle = variant;
        resolvedArtist = artistName;
        if (wiki) break outer;
      }
    }
  }

  const facts: HarvestedFact[] = [];
  const raw = track?.wiki?.content?.trim() || track?.wiki?.summary?.trim();
  facts.push(...wikiToSentences(raw, 'track'));

  if (track?.album?.title) {
    facts.push({
      fact: `Трек «${resolvedTitle}» исполнителя ${resolvedArtist} на Last.fm указан в альбоме «${track.album.title}».`,
      scope: 'track',
      source: 'lastfm',
      metadataOnly: true,
    });
  }
  return facts.slice(0, 6);
}

export async function fetchLastfmFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  if (!API_KEY) return [];

  const [trackFacts, artistFacts] = await Promise.all([
    fetchTrackInfo(ctx.artist, ctx.title),
    fetchArtistInfo(ctx.artist),
  ]);

  const seen = new Set<string>();
  const out: HarvestedFact[] = [];
  for (const item of [...trackFacts, ...artistFacts]) {
    const key = item.fact.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 8);
}
