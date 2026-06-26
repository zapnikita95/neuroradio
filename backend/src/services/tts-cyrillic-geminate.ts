/**
 * Yandex / Edge RU: сдвоенные согласные в заимствованиях (рифф, басс, беллами) и
 * удвоенные гласные (версии, коллекции) ломают TTS. Схлопываем в озвучке, display не трогаем.
 */

const CYRILLIC_CONSONANT = 'бвгджзклмнпрстфхцчшщ';
const CYRILLIC_VOWEL = 'аеёиоуыэюя';

/** Слова/корни, где двойная согласная — норма русского правописания. */
const KEEP_GEMINATE_STEMS = [
  'класс',
  'гласс',
  'пасс',
  'масс',
  'росс',
  'ссор',
  'ссуд',
  'групп',
  'шосс',
  'террасс',
  'професс',
  'ассист',
  'экспресс',
  'процесс',
  'бассейн',
  'кабель',
  'грипп',
  'коллек',
  'комплек',
  'телеграф',
];

function tokenKeepsGeminate(token: string): boolean {
  const lower = token.toLowerCase().replace(/\+/g, '');
  return KEEP_GEMINATE_STEMS.some((stem) => lower.includes(stem));
}

/** Схлопнуть удвоенные гласные (версии→верси для TTS) внутри токена. */
export function collapseVowelGeminateInCyrillicToken(token: string): string {
  if (!/[а-яё]/i.test(token)) return token;

  let result = token;
  const doubleVowelRe = new RegExp(`([${CYRILLIC_VOWEL}])\\1+`, 'giu');
  result = result.replace(doubleVowelRe, '$1');
  // vers+ii → vers+и (ударение перед первой «и»)
  result = result.replace(
    new RegExp(`([${CYRILLIC_VOWEL}])\\+([${CYRILLIC_VOWEL}])\\1`, 'giu'),
    '$1+$2',
  );
  return result;
}

export function collapseGeminateInCyrillicToken(token: string): string {
  if (!/[а-яё]/i.test(token) || tokenKeepsGeminate(token)) {
    return collapseVowelGeminateInCyrillicToken(token);
  }

  const geminateRe = new RegExp(
    `([${CYRILLIC_CONSONANT}])\\1(?=[${'аеёиоуыэюя'}]|$|[.,!?;:—–)\\]»+\\-\u2010\u2011\u2012\u2013\u2014])`,
    'gi',
  );
  let result = token.replace(geminateRe, '$1');
  result = collapseVowelGeminateInCyrillicToken(result);
  return result;
}

const LATIN_SLOT = '\uE014L';
const LATIN_SLOT_END = '\uE015';
const LATIN_RUN_RE =
  /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.\-&]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.\-&]*)*/g;
const MARKUP_RE = /<\[[^\]]+\]>/g;

/** Схлопнуть geminate в кириллице; латиница и Yandex-markup не трогаются. */
export function collapseCyrillicGeminatesForTts(text: string): string {
  if (!text.trim()) return text;

  const latinSlots: string[] = [];
  let masked = text.replace(LATIN_RUN_RE, (match) => {
    const idx = latinSlots.length;
    latinSlots.push(match);
    return `${LATIN_SLOT}${idx}${LATIN_SLOT_END}`;
  });
  masked = masked.replace(MARKUP_RE, (m) => m);

  masked = masked
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim() || !/[а-яё]/i.test(part)) return part;
      return collapseGeminateInCyrillicToken(part);
    })
    .join('');

  return masked.replace(
    new RegExp(`${LATIN_SLOT}(\\d+)${LATIN_SLOT_END}`, 'g'),
    (_, index) => latinSlots[Number(index)] ?? '',
  );
}
