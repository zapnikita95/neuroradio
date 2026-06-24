/**
 * Detect German Latin phrases (artists, tracks) for SSML de-DE and Edge DE voices.
 */
import germanData from '../data/german-pronunciation.json' with { type: 'json' };

const PHRASE_KEYS = new Set(Object.keys(germanData.phrases).map((k) => normalizePhraseKey(k)));
const ARTIST_KEYS = new Set(germanData.artistKeys.map((k) => normalizePhraseKey(k)));
const WORD_KEYS = new Set(Object.keys(germanData.words).map((k) => k.toLowerCase()));

/** German graphemes / markers — strong signal. */
const DE_GRAPHEME_RE = /[äöüßÄÖÜ]|(?:^|\s)(?:sch|tsch|tz|pf|ck|str)(?=[a-zäöü])/i;

/** Common German function words in song titles. */
const DE_MARKER_WORDS = new Set([
  'und', 'der', 'die', 'das', 'ein', 'eine', 'dem', 'den', 'des', 'im', 'am', 'zum', 'zur',
  'mit', 'von', 'aus', 'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'ohne', 'gegen',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'nicht', 'ist', 'sind', 'war', 'hat', 'hast',
  'bin', 'bist', 'wird', 'kann', 'will', 'mich', 'dich', 'sich', 'mein', 'dein', 'sein',
  'auch', 'nur', 'noch', 'schon', 'sehr', 'gut', 'mehr', 'alle', 'alles', 'kein', 'keine',
  'lust', 'herz', 'brennt', 'liebe', 'leben', 'tod', 'nacht', 'tag', 'zeit', 'welt', 'land',
  'mann', 'frau', 'frei', 'feuer', 'sonne', 'mond', 'stern', 'bist', 'wo', 'was', 'wer', 'wie',
  'hier', 'dort', 'heute', 'morgen', 'immer', 'nie', 'zwei', 'drei', 'vier', 'fünf', 'funf',
  'links', 'rechts', 'auf', 'ab', 'an', 'zu', 'um', 'so', 'ganz', 'lass', 'mach', 'geh', 'komm',
  'sieh', 'hör', 'hor', 'tanz', 'sing', 'spiel', 'bleib', 'gib', 'nimm', 'halt', 'steh', 'fall',
  'lauf', 'fahr', 'flieg', 'schrei', 'wein', 'lach', 'schlaf', 'träum', 'traum', 'brenn', 'brennt',
  'verlierer', 'gewinner', 'deutsch', 'deutschland', 'wollt', 'ihr', 'bett', 'flammen', 'sehen',
  'meister', 'fleisch', 'asche', 'riechst', 'alte', 'leid', 'heirate', 'laich', 'bestrafe',
  'bück', 'bueck', 'spiel', 'klavier', 'eifersucht', 'küss', 'kuess', 'sehnsucht', 'teil', 'lama',
  'donnerschlag', 'morgenstern', 'zerstören', 'zerstoren', 'stirb', 'hilf', 'rammlied', 'weh',
  'waidmanns', 'heil', 'haifisch', 'bückst', 'bueckst', 'frühling', 'fruhling', 'zeig', 'ausländer',
  'auslander', 'puppe', 'diamant', 'adieu', 'lügen', 'lugen', 'armee', 'verlierer', 'nebel',
  'halleluja', 'amour', 'liebeslieder', 'spieluhr', 'rosenrot', 'mann', 'gegen', 'zerstören',
  'geträumt', 'getraumt', 'neu', 'neuen', 'fahren', 'schwarz', 'geklaut', 'atemlos', 'geboren',
  'leben', 'applaus', 'durch', 'monsoon', 'monsoon', 'autobahn', 'model', 'robots', 'musique',
  'non', 'stop', 'wind', 'change', 'still', 'loving', 'hurricane', 'angel', 'city', 'nights',
  'maria', 'magdalena', 'ready', 'set', 'automatic', 'daddy', 'cool', 'rivers', 'babylon',
  'stolen', 'dance', 'forever', 'young', 'japan', 'fish', 'touch', 'flames', 'love', 'rock',
  'amadeus', 'kommissar', 'fantastischen', 'fettes', 'brot', 'deich', 'kind', 'fritten', 'bude',
  'marteria', 'trettmann', 'capital', 'bra', 'bonez', 'apache', 'badmómzjay', 'loredana',
  'alligatoah', 'trans', 'europe', 'express', 'computer', 'world', 'hurricane', 'send', 'big',
]);

/** English-only artists — don't mis-detect as German. */
const EN_ONLY_ARTISTS = new Set([
  'red hot chili peppers', 'rage against the machine', 'michael jackson', 'the beatles', 'queen',
  'metallica', 'nirvana', 'drake', 'eminem', 'coldplay', 'gorillaz', 'the weeknd', 'ed sheeran',
  'taylor swift', 'beyonce', 'beyoncé', 'justin bieber', 'post malone', 'bruno mars', 'lady gaga',
  'one republic', 'onerepublic', 'twenty one pilots', 'crazy town', 'the cranberries', 'linkin park',
  'green day', 'foo fighters', 'arctic monkeys', 'radiohead', 'pink floyd', 'led zeppelin',
]);

export type ForeignSpeechLang = 'de' | 'en' | 'it' | 'es';

export function normalizePhraseKey(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[''`´]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[?!.,…]+$/g, '');
}

export function isKnownGermanPhrase(phrase: string): boolean {
  const key = normalizePhraseKey(phrase);
  return PHRASE_KEYS.has(key) || ARTIST_KEYS.has(key);
}

export function isKnownEnglishOnlyArtist(phrase: string): boolean {
  const key = normalizePhraseKey(phrase);
  return EN_ONLY_ARTISTS.has(key);
}

function countGermanWords(phrase: string): number {
  const tokens = normalizePhraseKey(phrase).split(/\s+/).filter(Boolean);
  let hits = 0;
  for (const t of tokens) {
    if (/[áéíóúñ]/i.test(t)) continue;
    const bare = t.replace(/[^a-zäöüß0-9-]/gi, '');
    if (!bare) continue;
    if (WORD_KEYS.has(bare.toLowerCase()) || DE_MARKER_WORDS.has(bare.toLowerCase())) hits += 1;
    if (ARTIST_KEYS.has(bare.toLowerCase())) hits += 2;
  }
  return hits;
}

/** True if Latin span should use de-DE (not en-US). */
export function isGermanLatinPhrase(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed || !/[A-Za-zÀ-ÿ]/.test(trimmed)) return false;

  // Spanish ñ/á — «Maná» must not collapse to German «man».
  if (/[áéíóúñ¿¡]/i.test(trimmed) && !/[äöüß]/i.test(trimmed)) return false;

  const key = normalizePhraseKey(trimmed);
  if (isKnownEnglishOnlyArtist(key)) return false;
  if (isKnownGermanPhrase(key)) return true;

  if (/[äöüß]/i.test(trimmed)) return true;
  if (DE_GRAPHEME_RE.test(trimmed)) return true;

  const tokens = key.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  const germanHits = countGermanWords(trimmed);
  if (germanHits >= Math.max(1, Math.ceil(tokens.length * 0.5))) return true;

  // Single-token heuristic: ends with German suffixes
  if (tokens.length === 1) {
    const w = tokens[0]!;
    if (/^(?:sch|pf|tz)/i.test(w)) return true;
    if (/(?:ung|heit|keit|chen|lein|isch|lich|los|bar|sam|schaft|tum|nis|tor|werk|mann|stein)$/i.test(w)) {
      return true;
    }
  }

  // "Die/Das/Der …" prefix
  if (/^(?:die|das|der)\s+/i.test(trimmed)) return true;

  return false;
}

export function detectForeignSpeechLang(latinSpan: string): ForeignSpeechLang {
  const trimmed = latinSpan.trim();
  if (!trimmed) return 'en';

  if (/[äöüß]/i.test(trimmed) && isGermanLatinPhrase(trimmed)) return 'de';

  if (/[áéíóúñ¿¡]/i.test(trimmed) && !/[äöüß]/i.test(trimmed)) {
    return 'es';
  }

  if (/[àèéìòù]/i.test(trimmed) && !/[äöüßñ]/i.test(trimmed)) {
    return 'it';
  }

  if (
    /\b(zitti|buoni|mambo|italiano|ciao|amore|bambino|gnocchi|partirò|partiro|bocelli|pavarotti)\b/i.test(
      trimmed,
    ) ||
    (/tti\b|gn[a-z]|gli|cci/i.test(trimmed) && !isGermanLatinPhrase(trimmed))
  ) {
    return 'it';
  }

  if (isGermanLatinPhrase(trimmed)) return 'de';
  return 'en';
}

export function foreignLangToXmlLang(lang: ForeignSpeechLang): string {
  switch (lang) {
    case 'de':
      return 'de-DE';
    case 'it':
      return 'it-IT';
    case 'es':
      return 'es-ES';
    default:
      return 'en-US';
  }
}

export { germanData };
