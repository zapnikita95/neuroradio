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
      if (yearCase === 'prep') return `двухтысячном ${unit}`;
      if (yearCase === 'gen') return `двухтысячного ${unit}`;
      return `двухтысячный ${UNITS.nom[tail]}`;
    }
    return twoDigitOrdinal(tail, yearCase);
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

/** JS \\b is unreliable with Cyrillic — use explicit separators like story-quality.ts. */
const PRE_V = /(^|[\s,.«"—-])([Вв])\s+((?:19|20)\d{2})\s+году(?=[\s,.!?»"—-]|$)/gu;
const PRE_V_NOM = /(^|[\s,.«"—-])([Вв])\s+((?:19|20)\d{2})\s+год(?=[\s,.!?»"—-]|$)/gu;
const GEN_YEAR = /(^|[\s,.«"—-])((?:19|20)\d{2})\s+года(?=[\s,.!?»"—-]|$)/gu;
const NOM_YEAR = /(^|[\s,.«"—-])((?:19|20)\d{2})\s+год(?=[\s,.!?»"—-]|$)/gu;

/** «В 2021 году» → «В двадцать первом году»; «с 2020 года» → «с двадцатого года». */
export function normalizeYearsForRussianTts(text: string): string {
  let result = text.replace(
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
