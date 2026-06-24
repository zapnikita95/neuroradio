/**
 * Detect Spanish Latin phrases for SSML es-ES and mixed-lang routing.
 */
import { normalizePhraseKey } from './de-lang-detect.js';

const ES_GRAPHEME_RE = /[áéíóúñ¿¡]/i;

const ES_MARKER_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'del', 'de', 'y', 'que', 'por', 'para',
  'con', 'sin', 'más', 'mas', 'muy', 'bien', 'corazón', 'corazon', 'amor', 'vida', 'noche', 'sol',
  'mar', 'hombre', 'mujer', 'niño', 'nino', 'señor', 'senor', 'señora', 'ningún', 'ningun',
  'después', 'despues', 'música', 'musica', 'canción', 'cancion', 'corazón', 'grande', 'pequeña',
  'pequena', 'baila', 'bailando', 'guitarra', 'corazones', 'estoy', 'estás', 'estas', 'donde',
  'dónde', 'como', 'cómo', 'qué', 'que', 'tú', 'tu', 'mi', 'mis', 'su', 'sus', 'te', 'me', 'le',
  'les', 'nos', 'os', 'hay', 'ser', 'estar', 'tengo', 'tiene', 'fue', 'era', 'son', 'somos',
]);

const KNOWN_ES_ARTISTS = new Set([
  'maná', 'mana', 'rosalía', 'rosalia', 'shakira', 'enrique iglesias', 'juanes', 'bad bunny',
  'j balvin', 'maluma', 'ricky martin', 'alejandro sanz', 'camilo', 'karol g', 'peso pluma',
  'caifanes', 'zoe', 'fito paez', 'fito páez', 'soda stereo', 'gustavo cerati',
]);

/** True if Latin span should use es-ES (not en-US / de-DE). */
export function isSpanishLatinPhrase(phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed || !/[A-Za-zÀ-ÿ]/.test(trimmed)) return false;
  if (/[äöüß]/i.test(trimmed)) return false;
  // Italian grave/circumflex — not Spanish (Con te partirò).
  if (/[ìòù]/i.test(trimmed)) return false;

  const key = normalizePhraseKey(trimmed);
  if (KNOWN_ES_ARTISTS.has(key)) return true;

  if (ES_GRAPHEME_RE.test(trimmed)) return true;

  const tokens = key.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  let hits = 0;
  for (const t of tokens) {
    const bare = t.replace(/[^a-záéíóúñ0-9-]/gi, '');
    if (ES_MARKER_WORDS.has(bare.toLowerCase())) hits += 1;
  }
  if (hits >= Math.max(1, Math.ceil(tokens.length * 0.4))) return true;

  if (/^(?:el|la|los|las|un|una|del|de)\s+/i.test(trimmed)) return true;
  return false;
}
