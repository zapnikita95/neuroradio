import fetch from 'node-fetch';
import type { ReferenceFactBundle } from './fact-picker.js';
import { filterAndRankFacts, isBoringFact } from './reference-fact-quality.js';

const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';

function wikiLang(countryCode?: string): 'ru' | 'en' {
  return countryCode === 'RU' ? 'ru' : 'en';
}

function toWikiTitle(raw: string): string {
  return encodeURIComponent(raw.trim().replace(/\s+/g, '_'));
}

async function fetchSummary(lang: 'ru' | 'en', title: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${toWikiTitle(title)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { extract?: string };
    const extract = data.extract?.trim();
    return extract && extract.length > 40 ? extract : null;
  } catch {
    return null;
  }
}

async function searchWikiTitle(lang: 'ru' | 'en', query: string): Promise<string | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*` +
    `&srlimit=5&srsearch=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    return data.query?.search?.[0]?.title ?? null;
  } catch {
    return null;
  }
}

function normalizeWikiText(text: string): string {
  return text
    .replace(/^=+\s*.+?\s*=+\s*$/gm, ' ')
    .replace(/\s=+\s*[^=\n]+?\s*=+\s*/g, ' ')
    .replace(/\(\d{4}[^)]{0,120}\)/g, ' ')
    .replace(/\[[^\]]{0,120}\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeSentenceFragments(raw: string[]): string[] {
  const merged: string[] = [];
  for (const part of raw) {
    const sentence = part.trim();
    if (!sentence) continue;
    if (
      merged.length > 0 &&
      (/^[,;:]/.test(sentence) || /^which\b/i.test(sentence) || sentence.length < 50)
    ) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${sentence}`.replace(/\s+/g, ' ').trim();
    } else {
      merged.push(sentence);
    }
  }
  return merged;
}

const MAX_FACT_SENTENCE_LEN = 360;

function splitWikiSentences(text: string): string[] {
  return mergeSentenceFragments(
    normalizeWikiText(text)
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
  ).filter((s) => s.length >= 35 && s.length <= MAX_FACT_SENTENCE_LEN);
}

function extractFactBullets(text: string, max = 12): string[] {
  return filterAndRankFacts(splitWikiSentences(text), max);
}

function extractSentencesMentioning(text: string, needle: string, max = 6): string[] {
  const normalizedNeedle = normalizeForMatch(needle);
  const tokens = normalizedNeedle
    .split(' ')
    .filter((part) => part.length >= 3);
  if (tokens.length === 0) return [];

  return splitWikiSentences(text)
    .filter((sentence) => {
      const lower = normalizeForMatch(sentence);
      if (normalizedNeedle.length >= 8 && lower.includes(normalizedNeedle)) return true;
      const hits = tokens.filter((token) => lower.includes(token)).length;
      const threshold = tokens.length <= 2 ? 1 : Math.min(2, tokens.length);
      return hits >= threshold;
    })
    .slice(0, max);
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTrackTitleCandidates(artist: string, title: string): string[] {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [
    cleanTitle,
    `${cleanTitle} (${artist} song)`,
    `${cleanTitle} (song)`,
    `${cleanTitle} by ${artist}`,
    `${artist} ${cleanTitle}`,
  ].filter((value, index, arr) => value.length > 1 && arr.indexOf(value) === index);
}

function buildArtistTitleCandidates(artist: string): string[] {
  return [
    `${artist} (band)`,
    `${artist} (musical group)`,
    `${artist} (musician)`,
    `${artist} (singer)`,
    artist,
  ].filter((value, index, arr) => value.length > 1 && arr.indexOf(value) === index);
}

function buildTrackSearchQueries(artist: string, title: string): string[] {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [
    `${cleanTitle} ${artist} song`,
    `${cleanTitle} song ${artist}`,
    `${artist} ${cleanTitle}`,
  ];
}

function buildArtistSearchQueries(artist: string): string[] {
  return [
    `${artist} band`,
    `${artist} musical group`,
    `${artist} musician`,
    `${artist} singer`,
    artist,
  ];
}

function isDisambiguationExtract(text: string): boolean {
  return /\b(may refer to|most commonly refers to|disambiguation page|can refer to)\b/i.test(text);
}

function isWeakFact(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (/^[,;:]/.test(trimmed)) return true;
  if (/^which\b/i.test(trimmed)) return true;
  return (
    /\b(may refer to|most commonly refers to|Queen regnant|Queen consort|disambiguation)\b/i.test(sentence) ||
    isBoringFact(sentence)
  );
}

async function fetchExtendedExtract(lang: 'ru' | 'en', title: string, sentences = 40): Promise<string | null> {
  const encodedTitle = encodeURIComponent(title.trim().replace(/\s+/g, '_'));
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1` +
    `&exsentences=${sentences}&format=json&origin=*&titles=${encodedTitle}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      query?: { pages?: Record<string, { extract?: string }> };
    };
    const pages = data.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    const extract = page?.extract?.trim();
    return extract && extract.length > 40 ? extract : null;
  } catch {
    return null;
  }
}

async function fetchFactsForTitle(
  lang: 'ru' | 'en',
  title: string,
  mentionNeedle: string,
): Promise<string[]> {
  await sleep(120);
  const summary =
    (await fetchExtendedExtract(lang, title)) ?? (await fetchSummary(lang, title));
  if (!summary || isDisambiguationExtract(summary)) return [];
  const bullets = extractFactBullets(summary).filter((fact) => !isWeakFact(fact));
  if (bullets.length > 0) return bullets;
  return filterAndRankFacts(
    extractSentencesMentioning(summary, mentionNeedle).filter((fact) => !isWeakFact(fact)),
    6,
  );
}

async function fetchArtistMentionsForTrack(
  lang: 'ru' | 'en',
  artist: string,
  title: string,
): Promise<string[]> {
  for (const candidate of buildArtistTitleCandidates(artist)) {
    await sleep(120);
    const summary =
      (await fetchExtendedExtract(lang, candidate, 44)) ?? (await fetchSummary(lang, candidate));
    if (!summary || isDisambiguationExtract(summary)) continue;
    const mentions = filterAndRankFacts(
      extractSentencesMentioning(summary, title).filter((fact) => !isWeakFact(fact)),
      4,
    );
    if (mentions.length > 0) return mentions;
  }
  return [];
}

async function fetchFactsForLang(
  lang: 'ru' | 'en',
  artist: string,
  title: string,
  scope: 'track' | 'artist',
): Promise<string[]> {
  const candidates = scope === 'track'
    ? buildTrackTitleCandidates(artist, title)
    : buildArtistTitleCandidates(artist);
  const queries = scope === 'track'
    ? buildTrackSearchQueries(artist, title)
    : buildArtistSearchQueries(artist);
  const mentionNeedle = scope === 'track' ? title : artist;

  for (const candidate of candidates) {
    const facts = await fetchFactsForTitle(lang, candidate, mentionNeedle);
    if (facts.length > 0) return facts;
  }

  for (const query of queries) {
    const foundTitle = await searchWikiTitle(lang, query);
    if (!foundTitle) continue;
    if (scope === 'artist' && /\bdisambiguation\b/i.test(foundTitle)) continue;
    const facts = await fetchFactsForTitle(lang, foundTitle, mentionNeedle);
    if (facts.length > 0) return facts;
  }

  return [];
}

async function fetchScopeFacts(
  artist: string,
  title: string,
  countryCode: string | undefined,
  scope: 'track' | 'artist',
): Promise<string[]> {
  const primaryLang = wikiLang(countryCode);
  const primary = await fetchFactsForLang(primaryLang, artist, title, scope);
  if (primary.length > 0) return primary;

  // Enrich RU tracks from English Wikipedia; avoid RU fallback for Western artists (wrong language/extract).
  if (primaryLang === 'ru') {
    return fetchFactsForLang('en', artist, title, scope);
  }
  return [];
}

/**
 * Pull factual bullets from Wikipedia — track page and artist page separately.
 */
export async function fetchReferenceFactBundle(
  artist: string,
  title: string,
  countryCode?: string,
): Promise<ReferenceFactBundle> {
  const primaryLang = wikiLang(countryCode);
  const [trackFacts, artistFacts] = await Promise.all([
    fetchScopeFacts(artist, title, countryCode, 'track'),
    fetchScopeFacts(artist, title, countryCode, 'artist'),
  ]);

  let mergedTrackFacts = trackFacts;
  if (mergedTrackFacts.length === 0) {
    const fromArtist = await fetchArtistMentionsForTrack(primaryLang, artist, title);
    if (fromArtist.length > 0) {
      mergedTrackFacts = fromArtist;
    } else if (primaryLang === 'ru') {
      mergedTrackFacts = await fetchArtistMentionsForTrack('en', artist, title);
    }
  }

  return { trackFacts: mergedTrackFacts, artistFacts };
}

/** @deprecated use fetchReferenceFactBundle + pickReferenceFact */
export async function fetchReferenceFacts(
  artist: string,
  title: string,
  countryCode?: string,
): Promise<string[]> {
  const bundle = await fetchReferenceFactBundle(artist, title, countryCode);
  return [...bundle.trackFacts, ...bundle.artistFacts].slice(0, 6);
}
