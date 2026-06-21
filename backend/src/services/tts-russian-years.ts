/**
 * Spoken Russian year phrases for TTS (ordinal + case), e.g. «В 2021 году» → «В двадцать первом году».
 */

type YearCase = 'prep' | 'gen' | 'nom';

const UNITS: Record<YearCase, string[]> = {
  prep: ['', 'первом', 'втором', 'третьем', 'четвертом', 'пятом', 'шестом', 'седьмом', 'восьмом', 'девятом'],
  gen: ['', 'первого', 'второго', 'третьего', 'четвертого', 'пятого', 'шестого', 'седьмого', 'восьмого', 'девятого'],
  nom: ['', 'первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой', 'восьмой', 'девятый'],
};

const TEENS: Record<YearCase, string[]> = {
  prep: ['десятом', 'одиннадцатом', 'двенадцатом', 'тринадцатом', 'четырнадцатом', 'пятнадцатом', 'шестнадцатом', 'семнадцатом', 'восемнадцатом', 'девятнадцатом'],
  gen: ['десятого', 'одиннадцатого', 'двенадцатого', 'тринадцатого', 'четырнадцатого', 'пятнадцатого', 'шестнадцатого', 'семнадцатого', 'восемнадцатого', 'девятнадцатого'],
  nom: ['десятый', 'одиннадцатый', 'двенадцатый', 'тринадцатый', 'четырнадцатый', 'пятнадцатый', 'шестнадцатый', 'семнадцатый', 'восемнадцатый', 'девятнадцатый'],
};

const TENS_STEM = ['', '', 'двадцат', 'тридцат', 'сороков', 'пятидесят', 'шестидесят', 'семидесят', 'восьмидесят', 'девяност'];

const TENS_COMPOUND = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];

const ROUND_SUFFIX: Record<YearCase, string> = { prep: 'ом', gen: 'ого', nom: 'ый' };

function twoDigitOrdinal(n: number, yearCase: YearCase): string {
  if (n <= 0 || n >= 100) return String(n);
  if (n < 10) return UNITS[yearCase][n]!;
  if (n < 20) return TEENS[yearCase][n - 10]!;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (ones === 0) return `${TENS_STEM[tens]}${ROUND_SUFFIX[yearCase]}`;
  return `${TENS_COMPOUND[tens]} ${UNITS[yearCase][ones]}`;
}

function yearToSpoken(year: number, yearCase: YearCase): string {
  if (year === 2000) {
    if (yearCase === 'prep') return 'двухтысячном';
    if (yearCase === 'gen') return 'двухтысячного';
    return 'двухтысячный';
  }
  if (year >= 2001 && year <= 2099) {
    const tail = year % 100;
    if (year <= 2009) {
      const unit = UNITS[yearCase][tail]!;
      if (yearCase === 'prep') return `две тысячи ${unit}`;
      if (yearCase === 'gen') return `две тысячи ${UNITS.gen[tail]}`;
      return `две тысячи ${UNITS.nom[tail]}`;
    }
    const tailSpoken = twoDigitOrdinal(tail, yearCase);
    if (tail <= 10) {
      return `две тысячи ${tailSpoken}`;
    }
    return tailSpoken;
  }
  if (year >= 1900 && year <= 1999) {
    const tail = year % 100;
    if (tail === 0) {
      if (yearCase === 'prep') return 'тысяча девятьсотом';
      if (yearCase === 'gen') return 'тысяча девятьсотого';
      return 'тысяча девятисотый';
    }
    const tailSpoken = twoDigitOrdinal(tail, yearCase);
    if (yearCase === 'nom') return `тысяча девятьсот ${twoDigitOrdinal(tail, 'nom')}`;
    return `тысяча девятьсот ${tailSpoken}`;
  }
  return String(year);
}

function yearToSpokenFullGenitive(year: number): string {
  if (year >= 2000 && year <= 2099) {
    const tail = year % 100;
    return `две тысячи ${twoDigitOrdinal(tail, 'gen')}`;
  }
  return yearToSpoken(year, 'gen');
}

/** JS \\b is unreliable with Cyrillic — use explicit separators like story-quality.ts. */
const PRE_V = /(^|[\s,.«"—-])([Вв])\s+((?:19|20)\d{2})\s+году(?=[\s,.!?»"—-]|$)/gu;
const PRE_V_NOM = /(^|[\s,.«"—-])([Вв])\s+((?:19|20)\d{2})\s+год(?=[\s,.!?»"—-]|$)/gu;
const GEN_YEAR = /(^|[\s,.«"—-])((?:19|20)\d{2})\s+года(?=[\s,.!?»"—-]|$)/gu;
const NOM_YEAR = /(^|[\s,.«"—-])((?:19|20)\d{2})\s+год(?=[\s,.!?»"—-]|$)/gu;
const IN_BEGINNING_YEAR =
  /(^|[\s,.«"—-])((?:[Вв]\s+)?(?:начале|конце|середине))\s+((?:19|20)\d{2})(\s+года(?=[\s,.!?»"—-]|$))?/gu;
const SEASON_GEN_YEAR =
  /(^|[\s,.«"—-])((?:лета|летом|зимой|зимы|весной|весны|осенью|осени))\s+((?:19|20)\d{2})(\s+года(?=[\s,.!?»"—-]|$))?/gu;

const DECADE_GENITIVE: Record<number, string> = {
  20: 'двадцатых',
  30: 'тридцатых',
  40: 'сороковых',
  50: 'пятидесятых',
  60: 'шестидесятых',
  70: 'семидесятых',
  80: 'восьмидесятых',
  90: 'девяностых',
};

function decadeGenitiveSpoken(twoDigit: number, century: '19' | '20' | null): string {
  if (century === '20' && twoDigit === 0) return 'двухтысячных';
  if (century === '20' && twoDigit === 10) return 'десятых';
  if (century === '20' && twoDigit === 20) return 'двадцатых';
  if (century === '19' || century === null) {
    return DECADE_GENITIVE[twoDigit] ?? `${twoDigit}-х`;
  }
  return DECADE_GENITIVE[twoDigit] ?? `${twoDigit}-х`;
}

function decadePrepositionalSpoken(twoDigit: number, century: '19' | '20' | null): string {
  return decadeGenitiveSpoken(twoDigit, century);
}

const DECADE_ORDINAL_TTS =
  /(^|[\s,.«"—-])((?:19|20)?(\d{2}))\s*[-–—]?\s*х(?=[\s,.!?»"—-]|$)/giu;

/** «классикой 80-х» → «классикой восьмидесятых» (TTS only; display keeps «80-х»). */
export function normalizeDecadesForRussianTts(text: string): string {
  return text.replace(
    DECADE_ORDINAL_TTS,
    (match, lead: string, full: string, twoDigitStr: string, offset: number, whole: string) => {
      const two = parseInt(twoDigitStr, 10);
      const century: '19' | '20' | null = /^19/.test(full) ? '19' : /^20/.test(full) ? '20' : null;
      const before = whole.slice(Math.max(0, offset - 48), offset);
      const genitiveCtx =
        /(?:классик(?:ой|и)|стил(?:ем|я)|эстетик(?:ой|и)|дух(?:ом|а)|наслед(?:и(?:ем|я))|эпох(?:ой|и)|хит(?:ами|ов)?|классик\w*)\s*$/iu.test(
          before,
        );
      const prepCtx = /(?:^|[\s,.«"—-])(?:в|во)\s+$/iu.test(before);
      const spoken = genitiveCtx || prepCtx
        ? decadePrepositionalSpoken(two, century)
        : decadeGenitiveSpoken(two, century);
      return `${lead}${spoken}`;
    },
  );
}

/** «В 2021 году» → «В двадцать первом году»; «в начале 2010 года» → «в начале две тысячи десятого года». */
export function normalizeYearsForRussianTts(text: string): string {
  let result = text.replace(
    IN_BEGINNING_YEAR,
    (_match, lead: string, prep: string, digits: string, gada?: string) =>
      `${lead}${prep} ${yearToSpoken(Number(digits), 'gen')}${gada ?? ''}`,
  );
  result = result.replace(
    SEASON_GEN_YEAR,
    (_match, lead: string, season: string, digits: string, gada?: string) =>
      `${lead}${season} ${yearToSpokenFullGenitive(Number(digits))}${gada ?? ' года'}`,
  );
  result = result.replace(
    PRE_V,
    (_match, lead: string, prep: string, digits: string) =>
      `${lead}${prep} ${yearToSpoken(Number(digits), 'prep')} году`,
  );
  result = result.replace(
    PRE_V_NOM,
    (_match, lead: string, prep: string, digits: string) =>
      `${lead}${prep} ${yearToSpoken(Number(digits), 'nom')} год`,
  );
  result = result.replace(
    GEN_YEAR,
    (_match, lead: string, digits: string) => `${lead}${yearToSpoken(Number(digits), 'gen')} года`,
  );
  result = result.replace(
    NOM_YEAR,
    (_match, lead: string, digits: string) => `${lead}${yearToSpoken(Number(digits), 'nom')} год`,
  );
  return result.replace(/\s{2,}/g, ' ');
}
