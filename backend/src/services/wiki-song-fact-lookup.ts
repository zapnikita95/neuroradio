/**
 * Deterministic Wikipedia song-page lookup — same path a human/LLM would use:
 * normalize duo artist tag → search «Title Artist song» → read intro sections.
 * Used when harvest bundle is empty/weak or before LLM fact-hunt.
 */
import { collaboratorNames, normalizeCollabArtistTag } from './artist-primary.js';
import { factMentionsTitle } from './fact-relevance.js';
import { fetchFastTrackWikiFacts, fetchWikiExtractDirect, pickIntroWikiFact } from './wikipedia-facts.js';
import { filterAndRankFacts, interestScore } from './reference-fact-quality.js';

function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[.!?…]+$/g, '')
    .trim();
}

function wikiTitleCaseArtist(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function searchWikiSongPageTitle(artist: string, title: string): Promise<string | null> {
  const cleanTitle = cleanTrackTitle(title);
  const collabs = collaboratorNames(artist);
  const normalized = normalizeCollabArtistTag(artist);

  const candidates: string[] = [];
  if (collabs.length === 2) {
    const duo = `${collabs[0]} & ${collabs[1]}`;
    candidates.push(`${cleanTitle} (${wikiTitleCaseArtist(duo)} song)`);
  }
  if (normalized !== artist.trim()) {
    candidates.push(`${cleanTitle} (${wikiTitleCaseArtist(normalized)} song)`);
  }
  candidates.push(`${cleanTitle} (song)`);

  for (const pageTitle of candidates) {
    const extract = await fetchWikiExtractDirect('en', pageTitle);
    if (!extract || extract.length < 60) continue;
    if (!/\b(song|single|track)\b/i.test(extract.slice(0, 400))) continue;
    if (!factMentionsTitle(extract, title)) continue;
    return pageTitle;
  }

  const searchUrl =
    'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=' +
    encodeURIComponent(
      collabs.length === 2
        ? `${cleanTitle} ${collabs[0]} ${collabs[1]} song`
        : `${cleanTitle} ${normalized} song`,
    );
  try {
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'MusicStoryBFF/1.0 (wiki-song-lookup)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    for (const hit of data.query?.search ?? []) {
      const hitTitle = hit.title?.trim();
      if (!hitTitle) continue;
      if (!/\(song\)|\(.*song\)/i.test(hitTitle)) continue;
      const extract = await fetchWikiExtractDirect('en', hitTitle);
      if (extract && factMentionsTitle(extract, title)) return hitTitle;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export interface WikiSongLookupResult {
  pageTitle: string | null;
  facts: string[];
  snippets: string[];
}

/** Resolve Wikipedia song page and return ranked fact sentences + raw snippets for LLM hunt. */
export async function lookupWikiSongFacts(
  artist: string,
  title: string,
): Promise<WikiSongLookupResult> {
  const fastFacts = await fetchFastTrackWikiFacts(artist, title);
  if (fastFacts.length > 0) {
    const snippets = fastFacts.map((f) => `[wikipedia] ${f}`);
    return { pageTitle: null, facts: fastFacts, snippets };
  }

  const pageTitle = await searchWikiSongPageTitle(artist, title);
  if (!pageTitle) {
    return { pageTitle: null, facts: [], snippets: [] };
  }

  const extract = await fetchWikiExtractDirect('en', pageTitle);
  if (!extract) {
    return { pageTitle, facts: [], snippets: [] };
  }

  const introPick = pickIntroWikiFact(extract, artist, title, false);
  const intro = extract.split(/\n+==/)[0]?.trim() ?? '';
  const sentences = intro
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35 && s.length <= 420);

  const facts = filterAndRankFacts(
    [...(introPick ? [introPick] : []), ...sentences],
    6,
  ).filter((f) => interestScore(f) >= 4);

  const snippets =
    facts.length > 0
      ? facts.map((f) => `[wikipedia:${pageTitle}] ${f}`)
      : [`[wikipedia:${pageTitle}] ${intro.slice(0, 900)}`];

  console.log(
    `[wiki-song-lookup] "${artist}" — "${title}" page="${pageTitle}" facts=${facts.length}`,
  );
  return { pageTitle, facts, snippets };
}

/** Merge wiki song snippets ahead of weak harvest snippets for LLM fact-hunt. */
export async function enrichSnippetsWithWikiSongLookup(
  artist: string,
  title: string,
  rawSnippets: string[],
): Promise<string[]> {
  const titleAnchored = rawSnippets.filter((s) => factMentionsTitle(s, title)).length;
  if (titleAnchored >= 2 && rawSnippets.length >= 4) {
    return rawSnippets;
  }

  const lookup = await lookupWikiSongFacts(artist, title);
  if (lookup.snippets.length === 0) return rawSnippets;

  const merged = [...lookup.snippets, ...rawSnippets];
  const seen = new Set<string>();
  return merged.filter((s) => {
    const key = s.slice(0, 160).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
