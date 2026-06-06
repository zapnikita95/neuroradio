/**
 * Post-process wiki / LLM translations before TTS.
 * Fixes garbled Latin names, bad calques, and LLM hallucinated Russian words.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Person names → Russian phonetic for narration (Yandex reads Cyrillic well). */
const PERSON_NAME_RU: Record<string, string> = {
  'damon albarn': 'Деймон Элборн',
  'jamie hewlett': 'Джейми Хьюлетт',
  'murdoc niccals': 'Мёрдок Никкалс',
  'russell hobbs': 'Рассел Хоббс',
  '2-d': '2-D',
  '2d': '2-D',
  noodle: 'Noodle',
};

/** Band / act names — keep Latin for SSML en-US pronunciation. */
const ACT_NAME_LATIN: Record<string, string> = {
  gorillaz: 'Gorillaz',
  'de la soul': 'De La Soul',
  'the rasmus': 'The Rasmus',
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
  [/De\s+La\s+Soul\b/gi, 'De La Soul'],
  [/Jamie\s+Hevell\b/gi, 'Jamie Hewlett'],
  [/Джейми\s+Хевелл(?:ем|а|у)?\b/gi, 'Джейми Хьюлетт'],
  [/Мурдкинс\s+Никкалс/gi, 'Мёрдок Никкалс'],
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
  [/\bмузыкантом\s+Дамон(?:ом|а)?\s+Албарн(?:ом|а)?\b/gi, 'музыкантом Деймоном Элборном'],
  [/\bхудожником\s+Джейми\s+Хевелл(?:ем|а)?\b/gi, 'художником Джейми Хьюлеттом'],
  [/\bДамон(?:ом|а)?\s+Албарн(?:ом|а)?\b/gi, 'Деймоном Элборном'],
  [/\bДамон\s+Албарн\b/gi, 'Деймон Элборн'],
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
    ...Object.values(ACT_NAME_LATIN),
  ];
  const seen = new Set<string>();
  for (const name of candidates) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const canonical = ACT_NAME_LATIN[key] ?? name;
    if (!/[A-Za-zÀ-ÿ]/.test(canonical)) continue;
    const re = new RegExp(escapeRegExp(name), 'gi');
    result = result.replace(re, canonical);
  }
  return result;
}

function applyPersonNamePhonetics(script: string, artist: string): string {
  let result = script;
  const haystack = `${artist} ${script}`.toLowerCase();
  for (const [key, phonetic] of Object.entries(PERSON_NAME_RU)) {
    if (!haystack.includes(key.split(' ')[0] ?? key)) continue;
    const re = new RegExp(escapeRegExp(key), 'gi');
    result = result.replace(re, phonetic);
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
  result = restoreLatinActNames(result, artist);
  result = applyPersonNamePhonetics(result, artist);

  if (title.trim() && /[A-Za-zÀ-ÿ]/.test(title)) {
    const titleRe = new RegExp(escapeRegExp(title.trim()), 'gi');
    result = result.replace(titleRe, title.trim());
  }

  return result.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}
