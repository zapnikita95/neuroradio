/**
 * Detect Italian Latin phrases for SSML it-IT and mixed-lang routing.
 */
import { normalizePhraseKey } from './de-lang-detect.js';

const IT_GRAPHEME_RE = /[àèéìòù]/i;

const IT_MARKER_WORDS = new Set([
  'con', 'che', 'per', 'non', 'una', 'uno', 'della', 'del', 'della', 'nella', 'nel', 'nello',
  'questa', 'questo', 'notte', 'vita', 'amore', 'cuore', 'bella', 'bello', 'grande', 'piccolo',
  'sole', 'luna', 'stella', 'cielo', 'tempo', 'mondo', 'donna', 'uomo', 'bambino', 'bambina',
  'partirò', 'partiro', 'andare', 'venire', 'essere', 'avere', 'dire', 'fare', 'stare', 'volare',
  'canzone', 'musica', 'italiano', 'italiana', 'sempre', 'mai', 'più', 'piu', 'molto', 'tutto',
  'tutti', 'ogni', 'senza', 'sotto', 'sopra', 'dove', 'quando', 'come', 'perché', 'perche',
]);

const KNOWN_IT_PHRASES = new Set([
  'con te partirò',
  'con te partiro',
  'nessun dorma',
  'vivo per lei',
  'time to say goodbye',
]);

const KNOWN_IT_ARTISTS = new Set([
  'andrea bocelli', 'luciano pavarotti', 'zucchero', 'vasco rossi', 'laura pausini', 'eros ramazzotti',
  'tiziano ferro', 'jovanotti', 'elisa', 'maneskin', 'måneskin',
]);

/** True if Latin span should use it-IT (not en-US). */
export function isItalianLatinPhrase(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed || !/[A-Za-zÀ-ÿ]/.test(trimmed)) return false;
  if (/[äöüßñ]/i.test(trimmed)) return false;

  const key = normalizePhraseKey(trimmed);
  if (KNOWN_IT_PHRASES.has(key) || KNOWN_IT_ARTISTS.has(key)) return true;

  if (IT_GRAPHEME_RE.test(trimmed)) return true;

  const tokens = key.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  let hits = 0;
  for (const t of tokens) {
    const bare = t.replace(/[^a-zàèéìòù0-9-]/gi, '');
    if (IT_MARKER_WORDS.has(bare.toLowerCase())) hits += 1;
  }
  if (hits >= Math.max(1, Math.ceil(tokens.length * 0.45))) return true;

  if (/^(?:il|lo|la|i|gli|le|un|una|del|della|di)\s+/i.test(trimmed)) return true;
  return false;
}
