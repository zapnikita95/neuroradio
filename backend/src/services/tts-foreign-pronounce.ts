import {
  buildArtistPhrasePhoneticRu,
  lookupArtistPronunciation,
  replaceWholePhrase,
} from './artist-pronunciation.js';
import { normalizeGenreTermsForTts } from './tts-genre-pronounce.js';
import { fixWikiTranslationArtifacts } from './wiki-translate-quality.js';
import {
  englishPhraseToRussianPhonetic,
  englishWordToRussianPhonetic,
  hasLatinAfterPhonetic,
} from './en-phonetic-ru.js';
import { germanPhraseToRussianPhonetic, germanWordToRussianPhonetic, GERMAN_PHRASE_PHONETIC } from './de-phonetic-ru.js';
import { frenchPhraseToRussianPhonetic, frenchWordToRussianPhonetic, FRENCH_PHRASE_PHONETIC } from './fr-phonetic-ru.js';
import { detectForeignLang, isFrenchLatinPhrase, isGermanLatinPhrase, type ForeignLang } from './tts-foreign-lang.js';

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
  'savage garden': 'Савидж Гарден',
  'to the moon and back': 'Ту зе Мун энд Бэк',
  'to the moon & back': 'Ту зе Мун энд Бэк',
  'ed sheeran': 'Эд Ширан',
  thriller: 'тр+иллер',
  'red hot chili peppers': 'р+эд х+от ч+или п+эпэрз',
  'killing in the name': 'к+илинг ин зэ н+эйм',
  'rage against the machine': 'р+эйдж аг+энст зэ маш+ин',
  'stadium arcadium': 'ст+эйдиам арк+эйдиам',
  'michael jackson': 'м+айкл дж+эксон',
  'snow (hey oh)': 'сн+оу хей оу',
  'national film registry': 'Нэшнл Фильм Р+еджистри',
  'vincent price': 'Винсент Прайс',
  mtv: 'МТВ',
  'marc klasfeld': 'Марк Кл+асфелд',
  'sixteen candles': 'Сикст+ин К+андлз',
  'the cannonball run': 'К+эннонбол Р+ан',
  mp3: 'эмп+э три',
  filler: 'ф+иллер',
  'john landis': 'Джон Ландис',
  'jonah weiner': 'Джон Вайнер',
  blender: 'Блэндер',
  'michael peters': 'Майкл Питерс',
  moonwalk: 'мун уок',
  'moon walk': 'мун уок',
  xscape: 'икс скейп',
  'x scape': 'икс скейп',
  onerepublic: 'Уан Респаблик',
  'one republic': 'Уан Респаблик',
  'young money entertainment': 'Янг Мани Энтертейнмент',
  'edward christopher sheeran': 'Эдвард Кристофер Ширан',
  'shape of you': 'Шейп ов Ю',
  'asylum records': 'Азайлум Рекордс',
  'no.5 collaborations project': 'Ноу Пойнт Файв Коллаборейшнс Проект',
  'stressed out': 'Стрессд Аут',
  'twenty one pilots': 'Твэнти Уан Пайлотс',
  'crazy town': 'Крейзи Таун',
  butterfly: 'Баттерфлай',
  'nu metal': 'ню м+етал',
  'nu-metal': 'ню м+етал',
  ...GERMAN_PHRASE_PHONETIC,
  ...FRENCH_PHRASE_PHONETIC,
  ...buildArtistPhrasePhoneticRu(),
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
  jonah: 'Джон',
  weiner: 'Вайнер',
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
  to: 'ту',
  moon: 'мун',
  back: 'бэк',
  savage: 'савидж',
  garden: 'гарден',
  sheeran: 'ширан',
  edward: 'эдвард',
  christopher: 'кристофер',
  shape: 'шейп',
  asylum: 'азайлум',
  records: 'рекордс',
  halifax: 'Халифакс',
  framlingham: 'Фрамлингем',
  collaborations: 'коллаборейшнс',
  eurovision: 'Евровидение',
  tiktok: 'ТикТок',
  youtube: 'Ютуб',
  spotify: 'Спotify',
  john: 'Джон',
  landis: 'Ландис',
  michael: 'Майкл',
  peters: 'Питерс',
  vincent: 'Винсент',
  price: 'Прайс',
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

function normalizePhraseKey(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+/g, ' ')
    .replace(/[!?.…]+$/g, '');
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
  return englishWordToRussianPhonetic(word);
}

function transliterateGermanWord(word: string): string {
  return germanWordToRussianPhonetic(word);
}

export function latinPhraseToRussianTts(phrase: string, langHint?: ForeignLang): string {
  const trimmed = phrase.trim();
  if (!trimmed || !hasLatinLetters(trimmed)) return trimmed;

  const key = trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/\s*&\s*/g, ' and ');
  if (PHRASE_PRONUNCIATION_RU[key]) return PHRASE_PRONUNCIATION_RU[key];

  const lang = langHint ?? detectForeignLang(trimmed);
  if (lang === 'en') {
    return englishPhraseToRussianPhonetic(trimmed);
  }
  if (lang === 'de') {
    return germanPhraseToRussianPhonetic(trimmed);
  }
  if (lang === 'fr') {
    return frenchPhraseToRussianPhonetic(trimmed);
  }
  const words = trimmed.split(/\s+/);
  const mapped = words.map((word) => {
    if (word === '&') return 'энд';
    if (!hasLatinLetters(word)) return word;
    const punct = word.match(/[.!?…;:]+$/)?.[0] ?? '';
    const core = punct ? word.slice(0, -punct.length) : word;
    const wl = core.toLowerCase().replace(/['']/g, '');
    if (EN_WORD_RU[wl]) return capitalizeLike(core, EN_WORD_RU[wl]!) + punct;
    if (lang === 'it') return transliterateItalianWord(word);
    if (lang === 'es') return transliterateSpanishWord(word);
    if (lang === 'de') return germanWordToRussianPhonetic(word);
    if (lang === 'fr') return frenchWordToRussianPhonetic(word);
    return transliterateEnglishWord(word);
  });
  return mapped.join(' ');
}

const LATIN_CHAR_RU: Record<string, string> = {
  a: 'эй',
  b: 'би',
  c: 'си',
  d: 'ди',
  e: 'и',
  f: 'эф',
  g: 'джи',
  h: 'эйч',
  i: 'ай',
  j: 'джей',
  k: 'кей',
  l: 'эл',
  m: 'эм',
  n: 'эн',
  o: 'оу',
  p: 'пи',
  q: 'кью',
  r: 'ар',
  s: 'эс',
  t: 'ти',
  u: 'ю',
  v: 'ви',
  w: 'дабл-ю',
  x: 'икс',
  y: 'уай',
  z: 'зи',
};

/** Single isolated Latin letter (B-side) — letter name, not «б». */
function spellLatinLetterName(word: string): string {
  let out = '';
  for (const ch of word) {
    if (/[A-Za-z]/.test(ch)) {
      out += LATIN_CHAR_RU[ch.toLowerCase()] ?? ch;
    } else {
      out += ch;
    }
  }
  return out;
}

function lookupPhraseTts(phrase: string): string {
  return latinPhraseToRussianTts(phrase);
}

/** Replace every Latin run with Cyrillic — Yandex ru voice, no per-letter SSML. */
function ensureAllLatinTransliterated(text: string): string {
  let result = text;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = result.replace(
      /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9''.\-&]*/g,
      (match) => {
        if (!/[A-Za-zÀ-ÿ]/.test(match)) return match;
        const key = normalizePhraseKey(match);
        if (PHRASE_PRONUNCIATION_RU[key]) return PHRASE_PRONUNCIATION_RU[key]!;
        const ru = lookupPhraseTts(match.replace(/\s*&\s*/g, ' and '));
        if (hasLatinAfterPhonetic(ru)) {
          if (isFrenchLatinPhrase(match)) return frenchPhraseToRussianPhonetic(match);
          if (isGermanLatinPhrase(match)) return germanPhraseToRussianPhonetic(match);
          return englishPhraseToRussianPhonetic(match);
        }
        return ru;
      },
    );
    if (next === result) break;
    result = next;
  }
  return result.replace(/[A-Za-zÀ-ÿ]+/g, (match) => {
    const key = match.toLowerCase();
    if (PHRASE_PRONUNCIATION_RU[key]) return PHRASE_PRONUNCIATION_RU[key]!;
    if (isFrenchLatinPhrase(match)) return frenchWordToRussianPhonetic(match);
    if (isGermanLatinPhrase(match)) return germanWordToRussianPhonetic(match);
    return englishWordToRussianPhonetic(match);
  });
}

const MARKUP_SLOT = '\uE000';
const MARKUP_END = '\uE001';

function maskTtsMarkup(text: string): { masked: string; slots: string[] } {
  const slots: string[] = [];
  const masked = text.replace(/<\[(?:small|medium|large|tiny|huge|sentence)\]>/g, (tag) => {
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

/** Single-token FR/DE keys that are common English/Russian words — skip in phrase dict. */
const SKIP_PHRASE_DICT_HOMOGRAPHS = new Set([
  'she', 'he', 'me', 'we', 'us', 'or', 'so', 'in', 'on', 'at', 'as', 'it', 'is', 'am', 'an',
  'de', 'le', 'la', 'du', 'ne', 'se', 'ce', 'je', 'tu', 'il', 'on', 'ou', 'au', 'en', 'un',
  'les', 'des', 'mes', 'tes', 'ses', 'mon', 'ton', 'son', 'par', 'sur', 'que', 'qui', 'pas',
  'der', 'die', 'das', 'und', 'ist', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man',
  'mit', 'von', 'aus', 'bei', 'vor', 'nach', 'war', 'hat', 'bin', 'gut', 'tag', 'tod', 'nie',
  'ev', // artist abbrev; whole-word only but still homograph-prone in EN quotes
]);

function shouldApplyPhraseDictKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (k.length < 2) return false;
  if (!k.includes(' ') && SKIP_PHRASE_DICT_HOMOGRAPHS.has(k)) return false;
  return true;
}

/** Replace longest known Latin phrases first (case-insensitive, whole-word). */
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
    const isArtistExtra = Object.prototype.hasOwnProperty.call(extra, key);
    if (!isArtistExtra && !shouldApplyPhraseDictKey(key)) continue;
    const to = dict[key]!;
    const before = result;
    result = replaceWholePhrase(result, key, to);
    if (result !== before) {
      replacements.push({ from: key, to, source });
    }
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
  const re = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.\-&]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.\-&]*)*/g;
  return text.replace(re, (match) => {
    if (match.length < 2) return match;
    const to = lookupPhraseTts(match);
    if (to !== match) {
      replacements.push({ from: match, to, source: 'transliterate' });
    }
    return to;
  });
}

function transliterateRemainingLatin(text: string): string {
  return transliterateRemainingLatinLogged(text, []);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** «Title от Artist» → фонетика без русского «от» посередине (Silero/Edge). */
function mergeTitleOtArtistPhonetic(text: string, artist: string, title: string): string {
  const a = artist.trim();
  const t = title.trim();
  if (!a || !t || !/[A-Za-zÀ-ÿ]{2,}/.test(a) || !/[A-Za-zÀ-ÿ]{2,}/.test(t)) return text;
  const artistRu = latinPhraseToRussianTts(a);
  const titleVariants = [t];
  const short = t.match(/^([A-Za-zÀ-ÿ0-9'’.-]+)\s*\(/);
  if (short?.[1]) titleVariants.push(short[1]!);

  let result = text;
  for (const tv of titleVariants) {
    const titleRu = latinPhraseToRussianTts(tv);
    const re = new RegExp(
      `${escapeRegExp(tv)}\\s*,?\\s*от\\s+${escapeRegExp(a)}`,
      'gi',
    );
    result = result.replace(re, `${titleRu} ${artistRu}`);
  }
  return result;
}

function buildArtistTitleExtra(artist: string, title: string): Record<string, string> {
  const extra: Record<string, string> = {};
  const a = artist.trim();
  const t = title.trim();
  const artistEntry = lookupArtistPronunciation(a);
  if (a) {
    extra[a.toLowerCase()] = artistEntry?.ru ?? lookupPhraseTts(a);
  }
  if (t) {
    const titleEntry = lookupArtistPronunciation(t);
    const ru = titleEntry?.ru ?? lookupPhraseTts(t);
    extra[t.toLowerCase()] = ru;
    extra[t.toLowerCase().replace(/\s*&\s*/g, ' and ')] = ru;
  }
  return extra;
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
  const extra = buildArtistTitleExtra(artist, title);
  if (artist.trim() && extra[artist.trim().toLowerCase()]) {
    replacements.push({
      from: artist.trim(),
      to: extra[artist.trim().toLowerCase()]!,
      source: 'artist',
    });
  }
  if (title.trim() && extra[title.trim().toLowerCase()]) {
    replacements.push({
      from: title.trim(),
      to: extra[title.trim().toLowerCase()]!,
      source: 'title',
    });
  }

  let result = mergeTitleOtArtistPhonetic(text, artist, title);
  result = normalizeGenreTermsForTts(result);

  const { masked, slots } = maskTtsMarkup(result);
  result = applyPhraseDictionaryLogged(masked, extra, replacements, 'dictionary');
  result = transliterateRemainingLatinLogged(result, replacements);
  result = unmaskTtsMarkup(result, slots);
  const { masked: m2, slots: s2 } = maskTtsMarkup(result);
  result = ensureAllLatinTransliterated(m2);
  return { text: unmaskTtsMarkup(result, s2), replacements };
}

/** Full pass: dictionary → transliteration → pure Cyrillic for Yandex ru voice. */
export function applyForeignPronunciation(
  text: string,
  artist = '',
  title = '',
): string {
  const extra = buildArtistTitleExtra(artist, title);

  let merged = mergeTitleOtArtistPhonetic(text, artist, title);
  merged = normalizeGenreTermsForTts(merged);
  const { masked, slots } = maskTtsMarkup(merged);
  let result = applyPhraseDictionary(masked, extra);
  result = transliterateRemainingLatin(result);
  result = unmaskTtsMarkup(result, slots);
  const { masked: m2, slots: s2 } = maskTtsMarkup(result);
  result = ensureAllLatinTransliterated(m2);
  return unmaskTtsMarkup(result, s2);
}

/** Yandex RU voice: directors/brands → Cyrillic (no SSML en-US pauses). Track/artist Latin stays for SSML. */
const YANDEX_PERSONA_DICT_KEYS = [
  'the cannonball run',
  'sixteen candles',
  'national film registry',
  'marc klasfeld',
  'john landis',
  'michael peters',
  'vincent price',
  'jonah weiner',
  'john landis',
  'mtv',
  'mp3',
];

const YANDEX_ROLE_LATIN_RE =
  /(Режисс(?:ё|е)р(?:ом|а|у)?|хореограф(?:у|а|ом)?|продюсер(?:у|а|ом)?|акт(?:ё|е)р(?:а|ом|у)?|актрис(?:а|ой|е|у)?|композитор(?:а|ом|у)?|оператор(?:а|ом|у)?)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9''.\-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9''.\-]*){0,4})/giu;

export function applyYandexPersonaTransliteration(text: string): string {
  let result = text.replace(/\bMTV\b/gi, 'МТВ');

  result = result.replace(YANDEX_ROLE_LATIN_RE, (full, role: string, name: string) => {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    const fromDict = PHRASE_PRONUNCIATION_RU[key];
    const ru = fromDict ?? latinPhraseToRussianTts(trimmed);
    return `${role} ${ru}`;
  });

  const keys = YANDEX_PERSONA_DICT_KEYS.filter((k) => shouldApplyPhraseDictKey(k)).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of keys) {
    result = replaceWholePhrase(result, key, PHRASE_PRONUNCIATION_RU[key]!);
  }

  return result;
}

/** Fix LLM truncating band names in wiki translation. */
export function preserveMusicProperNames(script: string, artist: string, title: string): string {
  let result = fixWikiTranslationArtifacts(script, artist, title);
  const artistLower = artist.toLowerCase();

  if (/rammstein/i.test(artistLower)) {
    result = result.replace(/\bRamm\b/gi, 'Rammstein');
  }

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
      const rest = escaped.split(/\s+/).slice(1).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      // Расширяем только одиночное «Michael», не «Michael Peters» и не полное имя артиста.
      const wrongShort = new RegExp(
        `\\b${shortEsc}\\b(?!\\s+${rest})(?!\\s+[A-Za-zÀ-ÿА-Яа-яЁё])`,
        'i',
      );
      if (wrongShort.test(result) && !result.toLowerCase().includes(artist.trim().toLowerCase())) {
        result = result.replace(wrongShort, artist.trim());
      }
    }
  }

  if (title.trim() && /thriller/i.test(title.trim())) {
    result = result.replace(/\bТриллер\b/g, 'Thriller');
  }

  return result;
}
