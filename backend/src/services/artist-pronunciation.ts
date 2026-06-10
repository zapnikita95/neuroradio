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
