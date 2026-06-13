import artistData from '../data/artist-pronunciation.json' with { type: 'json' };

export interface ArtistPronunciationEntry {
  ru: string;
  en: string;
  aliases?: string[];
}

function normalizeArtistKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[$!?.]/g, '')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+/g, ' ')
    .replace(/[’']/g, "'");
}

const LOOKUP = new Map<string, ArtistPronunciationEntry>();

for (const [canonical, entry] of Object.entries(artistData.artists as Record<string, ArtistPronunciationEntry>)) {
  const keys = [canonical, ...(entry.aliases ?? [])];
  for (const key of keys) {
    LOOKUP.set(normalizeArtistKey(key), entry);
  }
}

export function lookupArtistPronunciation(artist: string): ArtistPronunciationEntry | null {
  const key = normalizeArtistKey(artist);
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export function buildArtistPhrasePhoneticRu(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [canonical, entry] of Object.entries(artistData.artists as Record<string, ArtistPronunciationEntry>)) {
    out[normalizeArtistKey(canonical)] = entry.ru;
    for (const alias of entry.aliases ?? []) {
      out[normalizeArtistKey(alias)] = entry.ru;
    }
  }
  return out;
}

export function buildArtistPhrasePhoneticEn(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [canonical, entry] of Object.entries(artistData.artists as Record<string, ArtistPronunciationEntry>)) {
    out[normalizeArtistKey(canonical)] = entry.en;
    for (const alias of entry.aliases ?? []) {
      out[normalizeArtistKey(alias)] = entry.en;
    }
  }
  return out;
}

function replaceLongestFirst(text: string, dict: Record<string, string>): string {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  let result = text;
  for (const key of keys) {
    if (key.length < 2) continue;
    const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(re, () => dict[key]!);
  }
  return result;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceWholePhrase(text: string, phrase: string, replacement: string): string {
  if (!phrase.trim()) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}'’-])${escapeRegExp(phrase.trim())}(?![\\p{L}\\p{N}'’-])`, 'giu');
  return text.replace(re, replacement);
}

/** Yandex/Edge: stylized artist tokens → Cyrillic (mgk → мджк), not letter-by-letter EN. */
export function applyStylizedArtistTokensRu(text: string, artist: string, title = ''): string {
  let result = text;
  for (const seed of [artist, title]) {
    const trimmed = seed.trim();
    if (!trimmed) continue;
    const entry = lookupArtistPronunciation(trimmed);
    if (!entry?.ru) continue;
    result = replaceWholePhrase(result, trimmed, entry.ru);
    for (const alias of entry.aliases ?? []) {
      result = replaceWholePhrase(result, alias, entry.ru);
    }
  }
  return result;
}

/** English/ElevenLabs/Azure — respelling for stylized artist names. */
export function applyEnglishArtistPronunciation(
  text: string,
  artist = '',
  title = '',
): string {
  const dict = buildArtistPhrasePhoneticEn();
  let result = text;
  for (const seed of [artist, title].filter(Boolean)) {
    const entry = lookupArtistPronunciation(seed);
    if (!entry) continue;
    const re = new RegExp(seed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(re, entry.en);
  }
  return replaceLongestFirst(result, dict);
}
