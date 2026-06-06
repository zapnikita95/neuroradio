/**
 * Post-process wiki / LLM translations before TTS.
 * Latin names stay Latin — Yandex SSML <lang en-US> reads them in English.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Person names — restore Latin spelling for SSML English pronunciation. */
const PERSON_NAME_LATIN: Record<string, string> = {
  'damon albarn': 'Damon Albarn',
  'деймон элборн': 'Damon Albarn',
  'damon alborn': 'Damon Albarn',
  'jamie hewlett': 'Jamie Hewlett',
  'джейми хьюлетт': 'Jamie Hewlett',
  'джейми хевелл': 'Jamie Hewlett',
  'murdoc niccals': 'Murdoc Niccals',
  'russell hobbs': 'Russell Hobbs',
  '2-d': '2-D',
  '2d': '2-D',
  noodle: 'Noodle',
};

/** Band / act names — keep Latin for SSML en-US pronunciation. */
const ACT_NAME_LATIN: Record<string, string> = {
  gorillaz: 'Gorillaz',
  'de la soul': 'De La Soul',
  'the rasmus': 'The Rasmus',
  'the cardigans': 'The Cardigans',
  't.a.t.u.': 't.A.T.u.',
  tatu: 't.A.T.u.',
  'feel good inc': 'Feel Good Inc.',
  maneskin: 'Måneskin',
  måneskin: 'Måneskin',
};

/** Common LLM garbling of Latin names in Russian text. */
const GARBLED_LATIN_FIXES: Array<[RegExp, string]> = [
  [/Горил(?:л)?\s*Laz\b/gi, 'Gorillaz'],
  [/Горril(?:l)?az\b/gi, 'Gorillaz'],
  [/Goril\s*Laz\b/gi, 'Gorillaz'],
  [/De\s+La\s+соул\b/gi, 'De La Soul'],
  [/Jamie\s+Hevell\b/gi, 'Jamie Hewlett'],
  [/Джейми\s+Хевелл(?:ем|а|у)?\b/gi, 'Jamie Hewlett'],
  [/Дамон(?:ом|а)?\s+Албарн(?:ом|а)?\b/gi, 'Damon Albarn'],
  [/Деймон(?:ом|а)?\s+Элборн(?:ом|а)?\b/gi, 'Damon Albarn'],
  [/Мурдкинс\s+Никкалс/gi, 'Murdoc Niccals'],
  [/Мúно\b/gi, ''],
  [/двух-двая\b/gi, 'четырёх'],
  [/двух\s+двая\b/gi, 'четырёх'],
];

/** Bad Russian calques from cheap translation models. */
const WIKI_RUSSIAN_FIXES: Array<[RegExp, string]> = [
  [/\bстрипт(?:ов|ы|ами|ах)?\b/gi, 'комиксов'],
  [/\bкаракат(?:ов|ы|ами|ах)?\b/gi, 'комиксов'],
  [/\bкомических\s+стрипт(?:ов|ы)?\b/gi, 'комиксов'],
  [/\bвиртуальн(?:ая|ой)\s+группа,\s+создана\b/gi, 'виртуальная группа, созданная'],
];

function splitArtistCollaborators(artist: string): string[] {
  return artist
    .split(/\s*(?:,|;|&|\band\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bx\b)\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function restoreLatinActNames(script: string, artist: string): string {
  let result = script;
  const candidates = [
    ...splitArtistCollaborators(artist),
    ...Object.keys(ACT_NAME_LATIN),
    ...Object.values(ACT_NAME_LATIN),
  ];
  const seen = new Set<string>();
  for (const name of candidates) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const canonical = ACT_NAME_LATIN[key] ?? (/[A-Za-zÀ-ÿ]/.test(name) ? name : null);
    if (!canonical) continue;
    const re = new RegExp(escapeRegExp(name), 'gi');
    result = result.replace(re, canonical);
  }
  return result;
}

function restoreLatinPersonNames(script: string): string {
  let result = script;
  for (const [key, latin] of Object.entries(PERSON_NAME_LATIN)) {
    const re = new RegExp(escapeRegExp(key), 'gi');
    result = result.replace(re, latin);
  }
  return result;
}

export function fixWikiTranslationArtifacts(
  script: string,
  artist: string,
  title: string,
): string {
  let result = script.trim();
  for (const [pattern, replacement] of GARBLED_LATIN_FIXES) {
    result = result.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of WIKI_RUSSIAN_FIXES) {
    result = result.replace(pattern, replacement);
  }
  result = restoreLatinPersonNames(result);
  result = restoreLatinActNames(result, artist);

  if (title.trim() && /[A-Za-zÀ-ÿ]/.test(title)) {
    const titleRe = new RegExp(escapeRegExp(title.trim()), 'gi');
    result = result.replace(titleRe, title.trim());
  }

  return result.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}
