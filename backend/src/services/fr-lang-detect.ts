/**
 * Detect French Latin phrases (artists, tracks) for SSML fr-FR and Edge FR voices.
 */
import frenchData from '../data/french-pronunciation.json' with { type: 'json' };

const PHRASE_KEYS = new Set(Object.keys(frenchData.phrases).map((k) => normalizePhraseKey(k)));
const ARTIST_KEYS = new Set(frenchData.artistKeys.map((k) => normalizePhraseKey(k)));
const WORD_KEYS = new Set(Object.keys(frenchData.words).map((k) => k.toLowerCase()));

/** French graphemes — strong signal. */
const FR_GRAPHEME_RE = /[àâäæçéèêëîïôœùûüÿ]/i;

/** Common French function words in song titles. */
const FR_MARKER_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'et', 'je', 'tu', 'il', 'elle', 'on',
  'nous', 'vous', 'ils', 'ne', 'pas', 'plus', 'dans', 'sur', 'pour', 'avec', 'sans', 'mais', 'ou',
  'où', 'qui', 'que', 'quoi', 'ce', 'cette', 'ces', 'mon', 'ton', 'son', 'mes', 'tes', 'ses', 'au',
  'aux', 'en', 'par', 'très', 'tres', 'bien', 'tout', 'tous', 'toute', 'nuit', 'jour', 'coeur',
  'cœur', 'amour', 'vie', 'monde', 'danse', 'chanson', 'mer', 'belle', 'beau', 'bon', 'bonne',
  'homme', 'femme', 'enfant', 'maison', 'rue', 'ville', 'france', 'paris', 'toujours', 'jamais',
  'encore', 'rien', 'meme', 'même', 'memes', 'mêmes', 'alors', 'comme', 'quand', 'papa', 'maman',
  'oui', 'non', 'merci', 'bonjour', 'bonsoir', 'adieu', 'reve', 'rêve', 'lune', 'soleil', 'etoile',
  'étoile', 'pluie', 'vent', 'feu', 'eau', 'terre', 'ciel', 'liberte', 'liberté', 'veux', 'ira',
  'meme', 'memes', 'memes', 'meme', 'meme', 'memes',
]);

/** Don't mis-detect as French. */
const EN_ONLY_PHRASES = new Set([
  'love story', 'get lucky', 'one more time', 'harder better faster stronger', 'around the world',
  'digital love', 'daft punk', 'the beatles', 'queen', 'coldplay',
]);

export function normalizePhraseKey(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, ' and ')
    .replace(/[''`´]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[?!.,…]+$/g, '');
}

export function isKnownFrenchPhrase(phrase: string): boolean {
  const key = normalizePhraseKey(phrase);
  return PHRASE_KEYS.has(key) || ARTIST_KEYS.has(key);
}

function countFrenchWords(phrase: string): number {
  const tokens = normalizePhraseKey(phrase).split(/\s+/).filter(Boolean);
  let hits = 0;
  for (const t of tokens) {
    const bare = t.replace(/[^a-zàâäæçéèêëîïôœùûüÿ'-]/gi, '');
    if (!bare) continue;
    if (WORD_KEYS.has(bare.toLowerCase()) || FR_MARKER_WORDS.has(bare.toLowerCase())) hits += 1;
    if (ARTIST_KEYS.has(bare.toLowerCase())) hits += 2;
  }
  return hits;
}

/** True if Latin span should use fr-FR (not en-US). */
export function isFrenchLatinPhrase(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed || !/[A-Za-zÀ-ÿ]/.test(trimmed)) return false;

  const key = normalizePhraseKey(trimmed);
  if (EN_ONLY_PHRASES.has(key)) return false;
  if (isKnownFrenchPhrase(key)) return true;

  if (FR_GRAPHEME_RE.test(trimmed)) return true;

  const tokens = key.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  const frenchHits = countFrenchWords(trimmed);
  if (frenchHits >= Math.max(1, Math.ceil(tokens.length * 0.45))) return true;

  if (tokens.length === 1) {
    const w = tokens[0]!;
    if (/(?:eau|eux|oir|tion|ment|elle|ette|isme|ique|age)$/i.test(w)) return true;
  }

  if (/^(?:le|la|les|un|une|des|du|de|l|j|n|d|qu|s|c|m|t)\s+/i.test(trimmed)) return true;
  if (/\b(je|tu|il|elle|on|nous|vous|ne|pas|dans|pour|avec|sans|mais|comme|quand|tous|tout)\b/i.test(trimmed)) {
    return true;
  }

  return false;
}

export { frenchData };
