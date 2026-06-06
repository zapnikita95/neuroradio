import { fixWikiTranslationArtifacts } from './wiki-translate-quality.js';

const PHRASE_PRONUNCIATION_RU: Record<string, string> = {
  'zitti e buoni': 'Цитти э буони',
  'bohemian rhapsody': 'Бохимиан Рэпсоди',
  queen: 'Куин',
  'ella boh': 'Элла Бо',
  'lou bega': 'Лоу Бега',
  'damiano david': 'Дамиано Дэйвид',
  babydoll: 'Бейбидол',
  'mambo no. 5': 'Мambo No. 5',
  'perhaps, perhaps, perhaps': 'Перхапс, перхапс, перхапс',
  silverlines: 'Силверлайнз',
  'born with a broken heart': 'Борн уиз э Брокен Харт',
  'funny little fears': 'Фанни Литл Фирс',
  'sanremo music festival': 'Сан-Ремо',
  'måneskin': 'Måneskin',
  maneskin: 'Måneskin',
  gorillaz: 'Gorillaz',
  'de la soul': 'De La Soul',
  'damon albarn': 'Damon Albarn',
  'jamie hewlett': 'Jamie Hewlett',
  'mambo italiano': 'Мambo Italiano',
  'moliendo café': 'Молиэндo Кафе',
  'moliendo cafe': 'Молиэндo Кафе',
  'next summer': 'Некст Саммер',
};

const EN_WORD_RU: Record<string, string> = {
  silver: 'силвер',
  lines: 'лайнз',
  line: 'лайн',
  born: 'борн',
  with: 'уиз',
  broken: 'брокен',
  heart: 'харт',
  funny: 'фанни',
  little: 'литл',
  fears: 'фирс',
  fear: 'фир',
  queen: 'куин',
  bohemian: 'бохимиан',
  rhapsody: 'рэпсоди',
  ella: 'элла',
  boh: 'бо',
  bega: 'бега',
  babydoll: 'бейбидол',
  perhaps: 'перхапс',
  bedroom: 'бедрум',
  david: 'Дэйвид',
  damiano: 'Дамиано',
  summer: 'саммер',
  next: 'некст',
  festival: 'фестиваль',
  music: 'мьюзик',
  single: 'сингл',
  singles: 'синглз',
  album: 'альбом',
  tour: 'тур',
  heartbreak: 'хартбрейк',
  studio: 'студио',
  live: 'лайв',
  feat: 'фeat',
  featuring: 'фичеринг',
  the: 'зе',
  and: 'энд',
  of: 'ов',
  de: 'де',
  la: 'ла',
  el: 'эль',
  los: 'лос',
  del: 'дель',
  san: 'сан',
  remo: 'ремо',
  eurovision: 'Евровидение',
  tiktok: 'ТикТок',
  youtube: 'Ютуб',
  spotify: 'Спotify',
};

const IT_WORD_RU: Record<string, string> = {
  zitti: 'Цитти',
  buoni: 'буони',
  buono: 'буоно',
  mambo: 'мambo',
  italiano: 'итальяно',
  ciao: 'чао',
  amore: 'аморе',
  vita: 'вита',
  bella: 'белла',
  e: 'э',
};

const ES_WORD_RU: Record<string, string> = {
  señor: 'сеньор',
  señora: 'сеньора',
  niño: 'нино',
  niña: 'нинья',
  español: 'эspanol',
  corazón: 'corason',
  mañana: 'manana',
};

export function hasLatinLetters(text: string): boolean {
  return /[A-Za-zÀ-ÿ]/.test(text);
}

type ForeignLang = 'en' | 'it' | 'es';

function detectForeignLang(phrase: string): ForeignLang {
  if (/ñ|¿|¡|[áéíóúü]/i.test(phrase)) return 'es';
  if (
    /\b(zitti|buoni|mambo|italiano|ciao|amore|gnocchi|bambino)\b/i.test(phrase) ||
    /tti|gn|gli|cci/i.test(phrase)
  ) {
    return 'it';
  }
  return 'en';
}

function capitalizeLike(original: string, translated: string): string {
  if (!original) return translated;
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return translated.charAt(0).toUpperCase() + translated.slice(1);
  }
  return translated;
}

function transliterateItalianWord(word: string): string {
  const bare = word.replace(/[^A-Za-zÀ-ÿ']/g, '');
  const lower = bare.toLowerCase();
  if (IT_WORD_RU[lower]) return capitalizeLike(bare, IT_WORD_RU[lower]);

  let out = lower;
  out = out.replace(/gn/g, 'нь');
  out = out.replace(/gli/g, 'ли');
  out = out.replace(/zz/g, 'дц');
  out = out.replace(/^z(?=[aeiou])/i, 'ц');
  out = out.replace(/ch/g, 'к');
  out = out.replace(/gh/g, 'g');
  out = out.replace(/c(?=[ie])/g, 'ч');
  out = out.replace(/c/g, 'к');
  out = out.replace(/g(?=[ie])/g, 'дж');
  out = out.replace(/qu/g, 'кв');
  out = out.replace(/h/g, '');
  return capitalizeLike(bare, out);
}

function transliterateSpanishWord(word: string): string {
  const bare = word.replace(/[^A-Za-zÀ-ÿñÑáéíóúüÁÉÍÓÚÜ]/g, '');
  const lower = bare.toLowerCase();
  if (ES_WORD_RU[lower]) return capitalizeLike(bare, ES_WORD_RU[lower]);

  let out = lower;
  out = out.replace(/ñ/g, 'нь');
  out = out.replace(/ll/g, 'й');
  out = out.replace(/j/g, 'х');
  out = out.replace(/v/g, 'б');
  out = out.replace(/z/g, 'с');
  out = out.replace(/h/g, '');
  out = out.replace(/[áéíóúü]/g, (ch) => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' })[ch] ?? ch);
  return capitalizeLike(bare, out);
}

function transliterateEnglishWord(word: string): string {
  const bare = word.replace(/[^A-Za-z'’.\-]/g, '');
  const lower = bare.toLowerCase().replace(/['’]/g, '');
  if (EN_WORD_RU[lower]) return capitalizeLike(bare, EN_WORD_RU[lower]);

  let out = lower;
  out = out.replace(/ph/g, 'f');
  out = out.replace(/tion/g, 'шн');
  out = out.replace(/sion/g, 'жн');
  out = out.replace(/ight/g, 'айт');
  out = out.replace(/ough/g, 'аф');
  out = out.replace(/ee/g, 'и');
  out = out.replace(/oo/g, 'у');
  out = out.replace(/ea/g, 'и');
  out = out.replace(/ou/g, 'ау');
  out = out.replace(/ow/g, 'ау');
  out = out.replace(/th/g, 'th');
  out = out.replace(/sh/g, 'ш');
  out = out.replace(/ch/g, 'ч');
  out = out.replace(/wh/g, 'у');
  out = out.replace(/wr/g, 'р');
  out = out.replace(/kn/g, 'н');
  out = out.replace(/mb$/g, 'm');
  out = out.replace(/([bcdfghjklmnpqrstvwxyz])e$/g, '$1');
  return capitalizeLike(bare, out);
}

export function latinPhraseToRussianTts(phrase: string, langHint?: ForeignLang): string {
  const trimmed = phrase.trim();
  if (!trimmed || !hasLatinLetters(trimmed)) return trimmed;

  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (PHRASE_PRONUNCIATION_RU[key]) return PHRASE_PRONUNCIATION_RU[key];

  const lang = langHint ?? detectForeignLang(trimmed);
  const words = trimmed.split(/\s+/);
  const mapped = words.map((word) => {
    if (!hasLatinLetters(word)) return word;
    if (lang === 'it') return transliterateItalianWord(word);
    if (lang === 'es') return transliterateSpanishWord(word);
    return transliterateEnglishWord(word);
  });
  return mapped.join(' ');
}

const MARKUP_SLOT = '\uE010M';
const MARKUP_END = '\uE011';

function maskTtsMarkup(text: string): { masked: string; slots: string[] } {
  const slots: string[] = [];
  const masked = text.replace(/<\[(?:small|medium|large|tiny|huge)\]>/g, (tag) => {
    const idx = slots.length;
    slots.push(tag);
    return `${MARKUP_SLOT}${idx}${MARKUP_END}`;
  });
  return { masked, slots };
}

function unmaskTtsMarkup(text: string, slots: string[]): string {
  return text.replace(
    new RegExp(`${MARKUP_SLOT}(\\d+)${MARKUP_END}`, 'g'),
    (_, index) => slots[Number(index)] ?? '',
  );
}

/** Replace longest known Latin phrases first (case-insensitive). */
function applyPhraseDictionaryLogged(
  text: string,
  extra: Record<string, string> = {},
  replacements: LatinTtsReplacement[],
  source: LatinTtsReplacement['source'],
): string {
  const dict = { ...PHRASE_PRONUNCIATION_RU, ...extra };
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  let result = text;
  for (const key of keys) {
    const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(re, (match) => {
      const to = dict[key]!;
      if (match !== to) {
        replacements.push({ from: match, to, source });
      }
      return to;
    });
  }
  return result;
}

function applyPhraseDictionary(text: string, extra: Record<string, string> = {}): string {
  return applyPhraseDictionaryLogged(text, extra, [], 'dictionary');
}

function transliterateRemainingLatinLogged(
  text: string,
  replacements: LatinTtsReplacement[],
): string {
  const re = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.\-]*)*/g;
  return text.replace(re, (match) => {
    if (match.length < 2) return match;
    const to = latinPhraseToRussianTts(match);
    if (to !== match) {
      replacements.push({ from: match, to, source: 'transliterate' });
    }
    return to;
  });
}

function transliterateRemainingLatin(text: string): string {
  return transliterateRemainingLatinLogged(text, []);
}

export interface LatinTtsReplacement {
  from: string;
  to: string;
  source: 'dictionary' | 'transliterate' | 'artist' | 'title';
}

/** Full pass with a log of Latin → Cyrillic substitutions (for Silero transcript cards). */
export function applyForeignPronunciationWithReplacements(
  text: string,
  artist = '',
  title = '',
): { text: string; replacements: LatinTtsReplacement[] } {
  const replacements: LatinTtsReplacement[] = [];
  const extra: Record<string, string> = {};
  if (artist.trim()) {
    const to = latinPhraseToRussianTts(artist);
    extra[artist.trim().toLowerCase()] = to;
    if (artist.trim() !== to) {
      replacements.push({ from: artist.trim(), to, source: 'artist' });
    }
  }
  if (title.trim()) {
    const to = latinPhraseToRussianTts(title);
    extra[title.trim().toLowerCase()] = to;
    if (title.trim() !== to) {
      replacements.push({ from: title.trim(), to, source: 'title' });
    }
  }

  const { masked, slots } = maskTtsMarkup(text);
  let result = applyPhraseDictionaryLogged(masked, extra, replacements, 'dictionary');
  result = transliterateRemainingLatinLogged(result, replacements);
  return { text: unmaskTtsMarkup(result, slots), replacements };
}

/** Full pass: dictionary → word transliteration for any leftover Latin. */
export function applyForeignPronunciation(
  text: string,
  artist = '',
  title = '',
): string {
  const extra: Record<string, string> = {};
  if (artist.trim()) extra[artist.trim().toLowerCase()] = latinPhraseToRussianTts(artist);
  if (title.trim()) extra[title.trim().toLowerCase()] = latinPhraseToRussianTts(title);

  const { masked, slots } = maskTtsMarkup(text);
  let result = applyPhraseDictionary(masked, extra);
  result = transliterateRemainingLatin(result);
  return unmaskTtsMarkup(result, slots);
}

/** Fix LLM truncating band names in wiki translation. */
export function preserveMusicProperNames(script: string, artist: string, title: string): string {
  let result = fixWikiTranslationArtifacts(script, artist, title);
  const artistLower = artist.toLowerCase();

  if (/maneskin|måneskin/i.test(artistLower)) {
    result = result.replace(/\bMå\b/g, 'Måneskin').replace(/\bMa\b(?=\s|,|\.)/g, 'Måneskin');
    result = result.replace(/\bMåneskin\b/gi, 'Måneskin');
  }

  if (/gorillaz/i.test(artistLower)) {
    result = result.replace(/\bGoril+\s*Laz\b/gi, 'Gorillaz');
    result = result.replace(/\bГорил+\s*Laz\b/gi, 'Gorillaz');
  }

  if (artist.trim() && hasLatinLetters(artist)) {
    const escaped = artist.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const short = artist.trim().split(/\s+/)[0];
    if (short && short.length >= 2 && short.length < artist.trim().length) {
      const shortEsc = short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wrongShort = new RegExp(`\\b${shortEsc}\\b(?!\\s${escaped.split(/\s+/).slice(1).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')})`, 'i');
      if (wrongShort.test(result) && !result.toLowerCase().includes(artist.trim().toLowerCase())) {
        result = result.replace(wrongShort, artist.trim());
      }
    }
  }

  void title;
  return result;
}
