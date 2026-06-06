import fetch from 'node-fetch';
import type { ReferenceFactBundle } from './fact-picker.js';
import { collaboratorNames, primaryArtistName } from './artist-primary.js';
import { factNamesForeignEntity } from './fact-relevance.js';
import { filterAndRankFacts, isBoringFact, isCollectorFact } from './reference-fact-quality.js';

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

async function searchWikiTitle(
  lang: 'ru' | 'en',
  query: string,
  artist = '',
  trackTitle = '',
): Promise<string | null> {
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
    const hits = data.query?.search ?? [];
    if (hits.length === 0) return null;
    if (!artist) return hits[0]?.title ?? null;
    const ranked = hits
      .map((hit) => hit.title?.trim() ?? '')
      .filter(Boolean)
      .sort(
        (a, b) =>
          scoreSearchTitle(b, artist, trackTitle) - scoreSearchTitle(a, artist, trackTitle),
      );
    return ranked[0] ?? null;
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
    .replace(/&(?:#91|#93|#x5B|#x5D);?/gi, ' ')
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

function sentenceMentions(sentence: string, needle: string): boolean {
  const normalizedNeedle = normalizeForMatch(needle);
  const tokens = normalizedNeedle.split(' ').filter((part) => part.length >= 3);
  if (tokens.length === 0) return false;
  const lower = normalizeForMatch(sentence);
  if (normalizedNeedle.length >= 4 && lower.includes(normalizedNeedle)) return true;
  const hits = tokens.filter((token) => lower.includes(token)).length;
  const threshold = tokens.length <= 2 ? 1 : Math.min(2, tokens.length);
  return hits >= threshold;
}

function extractSentencesMentioning(text: string, needle: string, max = 6): string[] {
  return splitWikiSentences(text)
    .filter((sentence) => sentenceMentions(sentence, needle))
    .slice(0, max);
}

/** Title mention + next sentences — catches «Hafanana» → Iron Curtain / East Berlin on artist page. */
function extractTrackContextFacts(
  text: string,
  title: string,
  artist = '',
  contextAfter = 2,
  max = 8,
): string[] {
  const sentences = splitWikiSentences(text);
  const indices = new Set<number>();
  sentences.forEach((sentence, index) => {
    if (!sentenceMentions(sentence, title)) return;
    indices.add(index);
    for (let offset = 1; offset <= contextAfter && index + offset < sentences.length; offset++) {
      indices.add(index + offset);
    }
  });
  const facts = [...indices].sort((a, b) => a - b).map((index) => sentences[index]);
  const anchored = facts.filter((fact, position) => {
    if (factNamesForeignEntity(fact, artist, title)) return false;
    const index = [...indices].sort((a, b) => a - b)[position];
    const isTitleSentence = sentenceMentions(sentences[index], title);
    if (isTitleSentence) {
      return artist ? isTrackAnchored(fact, artist, title) : true;
    }
    // Следующие предложения после упоминания трека («The song was… Hail») — без повторного названия.
    return true;
  });
  return filterAndRankFacts(anchored, max);
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

const extractCache = new Map<string, { at: number; text: string }>();
const EXTRACT_CACHE_MS = 5 * 60 * 1000;

function cacheKey(lang: string, title: string): string {
  return `${lang}:${title.trim().toLowerCase()}`;
}

function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[.!?…]+$/g, '')
    .trim();
}

function collabArtistVariants(artist: string): string[] {
  const names = collaboratorNames(artist);
  const variants = [artist, primaryArtistName(artist), ...names];
  if (names.length === 2) {
    variants.push(`${names[0]} and ${names[1]}`, `${names[0]} & ${names[1]}`);
  }
  return [...new Set(variants.filter((v) => v.length >= 2))];
}

function buildTrackTitleCandidates(artist: string, title: string): string[] {
  const cleanTitle = cleanTrackTitle(title);
  const out: string[] = [];
  for (const artistVariant of collabArtistVariants(artist)) {
    out.push(
      `${cleanTitle} (${artistVariant} song)`,
      `${cleanTitle} by ${artistVariant}`,
      `${artistVariant} ${cleanTitle}`,
    );
  }
  out.push(`${cleanTitle} (song)`, cleanTitle);
  return out.filter((value, index, arr) => value.length > 1 && arr.indexOf(value) === index);
}

function buildArtistTitleCandidates(artist: string): string[] {
  const base = [
    `${artist} (band)`,
    `${artist} (musical group)`,
    `${artist} (musician)`,
    `${artist} (singer)`,
    artist,
  ];
  if (/^[\p{Script=Cyrillic}]{2,12}$/u.test(artist.trim())) {
    base.unshift(`${artist} (группа)`, `${artist} (музыкальная группа)`);
  }
  return base.filter((value, index, arr) => value.length > 1 && arr.indexOf(value) === index);
}

function buildTrackSearchQueries(artist: string, title: string): string[] {
  const cleanTitle = cleanTrackTitle(title);
  const out: string[] = [];
  for (const artistVariant of collabArtistVariants(artist)) {
    out.push(
      `${cleanTitle} ${artistVariant} song`,
      `${cleanTitle} song ${artistVariant}`,
      `${artistVariant} ${cleanTitle}`,
    );
  }
  out.push(`${cleanTitle} song`);
  return out;
}

function buildArtistSearchQueries(artist: string): string[] {
  const base = [
    `${artist} band`,
    `${artist} musical group`,
    `${artist} musician`,
    `${artist} singer`,
    artist,
  ];
  if (/^[\p{Script=Cyrillic}]{2,12}$/u.test(artist.trim())) {
    base.unshift(`${artist} группа`, `${artist} (группа)`);
  }
  return base;
}

function isDisambiguationExtract(text: string): boolean {
  return /\b(may refer to|most commonly refers to|disambiguation page|can refer to)\b/i.test(text);
}

const WRONG_MUSIC_TOPIC_PATTERNS: RegExp[] = [
  /\b(?:book of daniel|persecution of the jews|destruction of the temple|2nd century bce|4 ezra|2 baruch)\b/i,
  /\b(?:characteristically gothic|count dracula|fin de si[eè]cle|vampire fiction|invasion literature)\b/i,
  /\b(?:esoteric numerology|heavenly journeys|pseudonyms, claiming)\b/i,
  /\b(?:the novel is|this novel|literary genre)\b/i,
  /\b(?:master craftsman|old european guild|journeyman aspiring)\b/i,
];

function factMentionsArtist(fact: string, artist: string): boolean {
  const tokens = normalizeForMatch(artist)
    .split(' ')
    .filter((part) => part.length >= 3);
  if (tokens.length === 0) return true;
  const norm = normalizeForMatch(fact);
  return tokens.some((token) => norm.includes(token));
}

function factMentionsTrack(fact: string, title: string): boolean {
  return sentenceMentions(fact, title.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
}

function isTrackAnchored(fact: string, artist: string, title: string): boolean {
  return (
    isCollectorFact(fact) ||
    factMentionsArtist(fact, artist) ||
    (title.length > 0 && factMentionsTrack(fact, title))
  );
}

function isWrongMusicTopic(artist: string, extract: string, pageTitle = ''): boolean {
  const combined = `${pageTitle} ${extract}`;
  if (!WRONG_MUSIC_TOPIC_PATTERNS.some((pattern) => pattern.test(combined))) {
    return false;
  }
  return !factMentionsArtist(extract, artist);
}

function scoreSearchTitle(title: string, artist: string, trackTitle: string): number {
  const lower = title.toLowerCase();
  let score = 0;
  if (/\(song\)|\(.*song\)/i.test(lower)) score += 12;
  if (lower.includes('disambiguation')) score -= 20;
  if (normalizeForMatch(lower).includes(normalizeForMatch(artist))) score += 8;
  if (normalizeForMatch(lower).includes(normalizeForMatch(trackTitle))) score += 6;
  if (/\bnovel\b/i.test(lower) && !/\(song\)/i.test(lower)) score -= 8;
  return score;
}

function isWeakFact(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (/^[,;:]/.test(trimmed)) return true;
  if (/^which\b/i.test(trimmed)) return true;
  return (
    /\b(may refer to|most commonly refers to|Queen regnant|Queen consort|disambiguation|guild system|journeyman|master craftsman)\b/i.test(sentence) ||
    isBoringFact(sentence)
  );
}

async function fetchFullExtract(
  lang: 'ru' | 'en',
  title: string,
  introOnly = false,
): Promise<string | null> {
  const key = cacheKey(lang, `${introOnly ? 'intro:' : ''}${title}`);
  const cached = extractCache.get(key);
  if (cached && Date.now() - cached.at < EXTRACT_CACHE_MS) return cached.text;

  const encodedTitle = encodeURIComponent(title.trim().replace(/\s+/g, '_'));
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1` +
    (introOnly ? '&exintro=1' : '') +
    `&format=json&origin=*&titles=${encodedTitle}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await sleep(400 * attempt);
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 429) continue;
      if (!response.ok) return null;
      const data = (await response.json()) as {
        query?: { pages?: Record<string, { extract?: string; missing?: string }> };
      };
      const pages = data.query?.pages;
      if (!pages) return null;
      const page = Object.values(pages)[0];
      if (page?.missing !== undefined) return null;
      const extract = page?.extract?.trim();
      if (!extract || extract.length <= 40) return null;
      extractCache.set(key, { at: Date.now(), text: extract });
      return extract;
    } catch {
      // retry
    }
  }
  return null;
}

function filterMusicFacts(
  facts: string[],
  artist: string,
  trackTitle: string,
  requireTrackAnchor: boolean,
): string[] {
  return facts.filter((fact) => {
    if (isWeakFact(fact)) return false;
    if (WRONG_MUSIC_TOPIC_PATTERNS.some((pattern) => pattern.test(fact)) && !factMentionsArtist(fact, artist)) {
      return false;
    }
    if (requireTrackAnchor && !isTrackAnchored(fact, artist, trackTitle)) return false;
    return true;
  });
}

const TRACK_BODY_SECTION_PATTERN =
  /^(composition|background|writing|recording|release|meaning|controversy|history|legacy|influence|reception)$/i;
const SKIP_WIKI_SECTION_PATTERN =
  /^(charts?|track\s*listing|personnel|certifications?|formats?|credits?|see\s+also|references|external\s+links|notes)$/i;

function stripWikiHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:#91|#93|#x5B|#x5D|#91;|#93;|#x5B;|#x5D;)/gi, ' ')
    .replace(/\[?\s*\d+\s*\]?/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWikiBodySections(lang: 'ru' | 'en', title: string): Promise<string[]> {
  const listUrl =
    `https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}` +
    `&prop=sections&format=json&origin=*`;
  try {
    const listResponse = await fetch(listUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!listResponse.ok) return [];
    const listData = (await listResponse.json()) as {
      parse?: { sections?: Array<{ index?: string; line?: string }> };
    };
    const sections = (listData.parse?.sections ?? []).filter((section) => {
      const line = section.line?.trim() ?? '';
      if (!line || SKIP_WIKI_SECTION_PATTERN.test(line)) return false;
      return TRACK_BODY_SECTION_PATTERN.test(line);
    });
    const texts: string[] = [];
    for (const section of sections.slice(0, 3)) {
      const index = section.index?.trim();
      if (!index) continue;
      await sleep(80);
      const sectionUrl =
        `https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}` +
        `&prop=text&section=${index}&format=json&origin=*`;
      const sectionResponse = await fetch(sectionUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!sectionResponse.ok) continue;
      const sectionData = (await sectionResponse.json()) as {
        parse?: { text?: { '*': string } };
      };
      const html = sectionData.parse?.text?.['*'];
      const text = html ? stripWikiHtml(html) : '';
      if (text.length >= 60) texts.push(text);
    }
    return texts;
  } catch {
    return [];
  }
}

async function fetchFactsForTitle(
  lang: 'ru' | 'en',
  title: string,
  mentionNeedle: string,
  trackContext = false,
  artist = '',
): Promise<string[]> {
  await sleep(120);
  let summary =
    (await fetchFullExtract(lang, title, trackContext)) ?? (await fetchSummary(lang, title));
  if (trackContext && summary) {
    const bodySections = await fetchWikiBodySections(lang, title);
    if (bodySections.length > 0) {
      summary = [summary, ...bodySections].join('\n\n');
    }
  }
  if (!summary || isDisambiguationExtract(summary)) return [];
  if (artist && isWrongMusicTopic(artist, summary, title)) return [];

  const requireTrackAnchor = trackContext && artist.length > 0;

  if (trackContext) {
    const intro =
      (await fetchFullExtract(lang, title, true)) ??
      summary.split('\n\n')[0]?.trim() ??
      summary;
    const bodySections = await fetchWikiBodySections(lang, title);
    const introFacts = filterMusicFacts(
      extractTrackContextFacts(intro, mentionNeedle, artist, 3, 8),
      artist,
      mentionNeedle,
      false,
    );
    const bodyFacts = bodySections.length
      ? filterMusicFacts(
          extractFactBullets(bodySections.join('\n\n'), 10),
          artist,
          mentionNeedle,
          false,
        )
      : [];
    const merged = filterAndRankFacts([...introFacts, ...bodyFacts], 8);
    if (merged.length > 0) return merged;
  }

  const bullets = filterMusicFacts(
    extractFactBullets(summary),
    artist,
    mentionNeedle,
    requireTrackAnchor,
  );
  if (bullets.length > 0) return bullets;
  if (trackContext) {
    const contextual = filterMusicFacts(
      extractTrackContextFacts(summary, mentionNeedle, artist),
      artist,
      mentionNeedle,
      false,
    );
    if (contextual.length > 0) return contextual;
  }
  return filterAndRankFacts(
    filterMusicFacts(
      extractSentencesMentioning(summary, mentionNeedle),
      artist,
      mentionNeedle,
      requireTrackAnchor,
    ),
    6,
  );
}

async function fetchArtistMentionsForTrack(
  lang: 'ru' | 'en',
  artist: string,
  title: string,
): Promise<string[]> {
  const titlesToTry = new Set<string>();
  const searched = await searchWikiTitle(lang, `${artist} musician`);
  if (searched) titlesToTry.add(searched);
  for (const candidate of buildArtistTitleCandidates(artist)) {
    titlesToTry.add(candidate);
  }

  for (const candidate of titlesToTry) {
    await sleep(120);
    const summary = (await fetchFullExtract(lang, candidate)) ?? (await fetchSummary(lang, candidate));
    if (!summary || isDisambiguationExtract(summary)) continue;
    const mentions = extractTrackContextFacts(summary, title, artist).filter((fact) => !isWeakFact(fact));
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

  const trackContext = scope === 'track';

  for (const candidate of candidates) {
    const facts = await fetchFactsForTitle(lang, candidate, mentionNeedle, trackContext, artist);
    if (facts.length > 0) return facts;
  }

  for (const query of queries) {
    const foundTitle = await searchWikiTitle(lang, query, artist, title);
    if (!foundTitle) continue;
    if (scope === 'artist' && /\bdisambiguation\b/i.test(foundTitle)) continue;
    const facts = await fetchFactsForTitle(lang, foundTitle, mentionNeedle, trackContext, artist);
    if (facts.length > 0) return facts;
  }

  return [];
}

function mergeFactLists(...pools: string[][]): string[] {
  return filterAndRankFacts(pools.flat(), 12);
}

/** Album page linked from song extract — e.g. Wovoka for Come and Get Your Love. */
async function fetchAlbumPageFacts(
  lang: 'ru' | 'en',
  artist: string,
  title: string,
): Promise<string[]> {
  for (const candidate of buildTrackTitleCandidates(artist, title)) {
    const summary = (await fetchFullExtract(lang, candidate)) ?? (await fetchSummary(lang, candidate));
    if (!summary) continue;
    const albumMatch = summary.match(
      /\b(?:album|альбом)[,\s]+([A-Za-z0-9][A-Za-z0-9'’\- ]{1,40}?)(?:\s*\(\d{4}\))?/i,
    );
    const albumName = albumMatch?.[1]?.trim();
    if (!albumName || albumName.length < 2) continue;
    const albumTitles = [
      `${albumName} (${artist} album)`,
      `${albumName} (album)`,
      albumName,
    ];
    for (const albumTitle of albumTitles) {
      const facts = await fetchFactsForTitle(lang, albumTitle, title, true, artist);
      if (facts.length > 0) return facts;
    }
  }
  return [];
}

/** Full band/artist page — biography angles beyond «упоминание трека». */
async function fetchBandPageFacts(lang: 'ru' | 'en', artist: string): Promise<string[]> {
  const titlesToTry = new Set<string>();
  const searched = await searchWikiTitle(lang, `${artist} band`, artist);
  if (searched) titlesToTry.add(searched);
  for (const candidate of buildArtistTitleCandidates(artist)) {
    titlesToTry.add(candidate);
  }

  const collected: string[] = [];
  for (const candidate of titlesToTry) {
    await sleep(100);
    const summary = (await fetchFullExtract(lang, candidate)) ?? (await fetchSummary(lang, candidate));
    if (!summary || isDisambiguationExtract(summary)) continue;
    if (isWrongMusicTopic(artist, summary, candidate)) continue;
    collected.push(...extractFactBullets(summary, 16));
    if (collected.length >= 8) break;
  }
  return filterAndRankFacts(collected, 10);
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
  const enLang: 'en' = 'en';

  let trackFromArtist = await fetchArtistMentionsForTrack(primaryLang, artist, title);
  if (trackFromArtist.length === 0 && primaryLang === 'ru') {
    trackFromArtist = await fetchArtistMentionsForTrack(enLang, artist, title);
  }
  let trackFromSong = await fetchScopeFacts(artist, title, countryCode, 'track');
  if (trackFromSong.length === 0 && primaryLang === 'ru') {
    trackFromSong = await fetchScopeFacts(artist, title, 'US', 'track');
  }
  let trackFacts = mergeFactLists(trackFromArtist, trackFromSong);

  const albumPrimary = await fetchAlbumPageFacts(primaryLang, artist, title);
  const albumFacts =
    albumPrimary.length > 0 || primaryLang === 'en'
      ? albumPrimary
      : await fetchAlbumPageFacts(enLang, artist, title);

  let artistFacts = await fetchScopeFacts(artist, title, countryCode, 'artist');
  const bandPrimary = await fetchBandPageFacts(primaryLang, artist);
  const bandFacts =
    bandPrimary.length > 0 || primaryLang === 'en'
      ? bandPrimary
      : await fetchBandPageFacts(enLang, artist);

  trackFacts = mergeFactLists(trackFacts, albumFacts);
  artistFacts = mergeFactLists(artistFacts, bandFacts);

  return { trackFacts, artistFacts };
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
