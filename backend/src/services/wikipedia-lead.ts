import fetch from 'node-fetch';
import { primaryArtistName } from './artist-primary.js';
import {
  buildMusicFirstWikiCandidates,
  isMusicArtistWikiExtract,
} from './wikipedia-music.js';

const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';

interface WikiParagraphCache {
  lead: string;
  paragraphs: string[];
  lang: 'en' | 'ru';
}

const paragraphCache = new Map<string, WikiParagraphCache>();

function toWikiTitle(raw: string): string {
  return encodeURIComponent(raw.trim().replace(/\s+/g, '_'));
}

/** Media tags often use ALL CAPS tokens — Wikipedia titles are usually title case (Lit Killah). */
function wikiTitleVariants(artist: string): string[] {
  const variants = new Set<string>([artist.trim()]);
  const acronymsToTitle = artist.replace(/\b[A-Z]{2,}\b/g, (word) => word.charAt(0) + word.slice(1).toLowerCase());
  variants.add(acronymsToTitle);
  const titleCase = artist.replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  variants.add(titleCase);
  return [...variants].filter((v) => v.length > 1);
}

function buildArtistTitleCandidates(artist: string): string[] {
  return buildMusicFirstWikiCandidates(artist);
}

async function searchWikiTitle(lang: 'en' | 'ru', query: string): Promise<string | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*` +
    `&srlimit=3&srsearch=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    return data.query?.search?.[0]?.title?.trim() ?? null;
  } catch {
    return null;
  }
}

async function fetchSummaryExtract(lang: 'en' | 'ru', title: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${toWikiTitle(title)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { extract?: string; type?: string };
    if (data.type === 'disambiguation') return null;
    const extract = data.extract?.trim();
    return extract && extract.length >= 40 ? extract : null;
  } catch {
    return null;
  }
}

function isDisambiguation(text: string): boolean {
  return /\b(may refer to|disambiguation)\b/i.test(text);
}

function cacheKey(artist: string): string {
  return primaryArtistName(artist)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveWikiPageTitle(artist: string): Promise<string | null> {
  const primary = primaryArtistName(artist);
  const titlesToTry = new Set<string>();
  for (const candidate of buildArtistTitleCandidates(primary)) {
    titlesToTry.add(candidate);
  }
  for (const query of [`${primary} musician`, `${primary} singer`, `${primary} rapper`, `${primary} band`, primary]) {
    for (const q of wikiTitleVariants(query)) {
      const found = await searchWikiTitle('en', q);
      if (found) titlesToTry.add(found);
    }
  }

  for (const wikiTitle of titlesToTry) {
    const en = await fetchSummaryExtract('en', wikiTitle);
    if (en && !isDisambiguation(en) && isMusicArtistWikiExtract(en)) return wikiTitle;
  }
  for (const wikiTitle of titlesToTry) {
    const ru = await fetchSummaryExtract('ru', wikiTitle);
    if (ru && !isDisambiguation(ru) && isMusicArtistWikiExtract(ru)) return wikiTitle;
  }
  return null;
}

async function fetchFullPlainExtract(lang: 'en' | 'ru', title: string): Promise<string | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1` +
    `&exintro=false&format=json&origin=*&titles=${toWikiTitle(title)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      query?: { pages?: Record<string, { extract?: string }> };
    };
    const pages = data.query?.pages ?? {};
    const extract = Object.values(pages)[0]?.extract?.trim();
    return extract && extract.length >= 80 ? extract : null;
  } catch {
    return null;
  }
}

function splitWikiParagraphs(fullText: string, lead: string): string[] {
  const chunks = fullText
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length >= 60);
  const leadNorm = lead.replace(/\s+/g, ' ').trim();
  return chunks.filter((p) => {
    if (p === leadNorm) return false;
    if (leadNorm.length >= 40 && p.startsWith(leadNorm.slice(0, Math.min(leadNorm.length, 80)))) {
      return false;
    }
    return true;
  });
}

/** Lead + extra paragraphs — cached in memory after first full fetch. */
export async function fetchArtistWikiParagraphs(
  artist: string,
): Promise<WikiParagraphCache | null> {
  const key = cacheKey(artist);
  const hit = paragraphCache.get(key);
  if (hit) return hit;

  const primary = primaryArtistName(artist);
  const leadResult = await fetchArtistWikiLead(primary);
  if (!leadResult) return null;

  const pageTitle = await resolveWikiPageTitle(primary);
  if (!pageTitle) {
    const minimal = { lead: leadResult.text, paragraphs: [], lang: leadResult.lang };
    paragraphCache.set(key, minimal);
    return minimal;
  }

  const fullEn = await fetchFullPlainExtract('en', pageTitle);
  const fullRu = fullEn ? null : await fetchFullPlainExtract('ru', pageTitle);
  const full = fullEn ?? fullRu;
  const lang: 'en' | 'ru' = fullEn ? 'en' : fullRu ? 'ru' : leadResult.lang;

  const paragraphs = full ? splitWikiParagraphs(full, leadResult.text) : [];
  const cached: WikiParagraphCache = {
    lead: leadResult.text,
    paragraphs: paragraphs.slice(0, 12),
    lang,
  };
  paragraphCache.set(key, cached);
  return cached;
}

export function resetWikiParagraphCache(): void {
  paragraphCache.clear();
}

/** First paragraph from artist Wikipedia — prefers English for indie bios. */
export async function fetchArtistWikiLead(
  artist: string,
): Promise<{ text: string; lang: 'en' | 'ru' } | null> {
  const primary = primaryArtistName(artist);
  const cached = paragraphCache.get(cacheKey(primary));
  if (cached) return { text: cached.lead, lang: cached.lang };

  const titlesToTry = new Set<string>();
  for (const candidate of buildArtistTitleCandidates(primary)) {
    titlesToTry.add(candidate);
  }
  for (const q of [`${primary} (музыкант)`, `${primary} (группа)`, `${primary} (певец)`, primary]) {
    const foundRu = await searchWikiTitle('ru', q);
    if (foundRu) titlesToTry.add(foundRu);
  }
  for (const query of [`${primary} musician`, `${primary} singer`, `${primary} rapper`, primary]) {
    for (const q of wikiTitleVariants(query)) {
      const found = await searchWikiTitle('en', q);
      if (found) titlesToTry.add(found);
    }
  }

  for (const wikiTitle of titlesToTry) {
    const ru = await fetchSummaryExtract('ru', wikiTitle);
    if (ru && !isDisambiguation(ru) && isMusicArtistWikiExtract(ru)) {
      return { text: ru, lang: 'ru' };
    }
  }

  for (const wikiTitle of titlesToTry) {
    const en = await fetchSummaryExtract('en', wikiTitle);
    if (en && !isDisambiguation(en) && isMusicArtistWikiExtract(en)) {
      return { text: en, lang: 'en' };
    }
  }

  return null;
}
