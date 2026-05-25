import fetch from 'node-fetch';
import type { ReferenceFactBundle } from './fact-picker.js';
import { factAppliesToRequest } from './fact-relevance.js';
import { filterAndRankFacts } from './reference-fact-quality.js';
import { buildFactHuntSearchQueries } from './story-fact-hunt.js';
import { fetchReferenceFactBundle as fetchWikipediaBundle } from './wikipedia-facts.js';

const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function splitByMention(facts: string[], title: string, artist: string): { track: string[]; artist: string[] } {
  const titleNorm = normalize(title);
  const artistNorm = normalize(artist);
  const track: string[] = [];
  const artistFacts: string[] = [];
  for (const fact of facts) {
    const norm = normalize(fact);
    if (titleNorm.length >= 4 && norm.includes(titleNorm)) track.push(fact);
    else artistFacts.push(fact);
  }
  return { track, artist: artistFacts };
}

function mergeFacts(...pools: string[][]): string[] {
  return filterAndRankFacts(pools.flat(), 8);
}

function factsAboutTrackOrArtist(facts: string[], artist: string, title: string): string[] {
  return facts.filter(
    (fact) =>
      factAppliesToRequest(fact, artist, title, 'track') ||
      factAppliesToRequest(fact, artist, title, 'artist'),
  );
}

async function fetchDuckDuckGo(artist: string, title: string): Promise<string[]> {
  const queries = [
    `${artist} ${title} song`,
    `${artist} musician biography`,
    ...buildFactHuntSearchQueries(artist, title),
  ];
  const collected: string[] = [];
  for (const query of queries) {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        AbstractText?: string;
        Abstract?: string;
        RelatedTopics?: Array<{ Text?: string; Topics?: Array<{ Text?: string }> }>;
      };
      for (const text of [data.AbstractText, data.Abstract]) {
        if (text && text.trim().length >= 35) collected.push(text.trim());
      }
      for (const topic of data.RelatedTopics ?? []) {
        if (topic.Text && topic.Text.length >= 35) collected.push(topic.Text);
        for (const nested of topic.Topics ?? []) {
          if (nested.Text && nested.Text.length >= 35) collected.push(nested.Text);
        }
      }
    } catch {
      // skip source
    }
    if (collected.length >= 6) break;
  }
  return filterAndRankFacts(collected, 6);
}

async function fetchWikidata(artist: string, title: string, countryCode?: string): Promise<string[]> {
  const lang = countryCode === 'RU' ? 'ru' : 'en';
  const queries = [`${title} ${artist} song`, artist];
  const results: string[] = [];
  for (const query of queries) {
    const url =
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}` +
      `&language=${lang}&format=json&origin=*&limit=2`;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        search?: Array<{ label?: string; description?: string }>;
      };
      for (const item of data.search ?? []) {
        const label = item.label?.trim() ?? '';
        const description = item.description?.trim() ?? '';
        if (label && description.length >= 25) results.push(`${label} — ${description}.`);
        else if (description.length >= 35) results.push(description);
      }
    } catch {
      // skip
    }
  }
  return filterAndRankFacts(results, 5);
}

async function fetchMusicBrainzAnnotations(entity: 'recording' | 'artist', mbid?: string): Promise<string[]> {
  const id = mbid?.trim();
  if (!id) return [];
  const url = `https://musicbrainz.org/ws/2/${entity}/${id}?inc=annotations&fmt=json`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return [];
      const data = (await response.json()) as { annotations?: Array<{ annotation?: string }> };
      const texts: string[] = [];
      for (const item of data.annotations ?? []) {
        const raw = item.annotation?.trim();
        if (!raw || raw.length < 35) continue;
        texts.push(
          ...raw
            .split(/(?<=[.!?…])\s+/)
            .map((s) => s.trim())
            .filter((s) => s.length >= 35 && s.length <= 240),
        );
      }
      return filterAndRankFacts(texts, 4);
    } catch (err) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      console.warn(`MusicBrainz annotations failed (${entity}):`, err);
    }
  }
  return [];
}

export async function fetchAggregatedFactBundle(
  artist: string,
  title: string,
  countryCode?: string,
  recordingMbid?: string,
  artistMbid?: string,
): Promise<ReferenceFactBundle> {
  const wiki = await fetchWikipediaBundle(artist, title, countryCode);
  const [ddg, wikidata, mbTrack, mbArtist] = await Promise.all([
    fetchDuckDuckGo(artist, title),
    fetchWikidata(artist, title, countryCode),
    fetchMusicBrainzAnnotations('recording', recordingMbid),
    fetchMusicBrainzAnnotations('artist', artistMbid),
  ]);

  const ddgFiltered = factsAboutTrackOrArtist(ddg, artist, title);
  const wdFiltered = factsAboutTrackOrArtist(wikidata, artist, title);
  const ddgSplit = splitByMention(ddgFiltered, title, artist);
  const wdSplit = splitByMention(wdFiltered, title, artist);

  return {
    trackFacts: mergeFacts(wiki.trackFacts, ddgSplit.track, wdSplit.track, mbTrack),
    artistFacts: mergeFacts(wiki.artistFacts, ddgSplit.artist, wdSplit.artist, mbArtist),
  };
}
