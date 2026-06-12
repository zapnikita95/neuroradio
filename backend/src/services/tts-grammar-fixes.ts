/**
 * Last-mile Russian grammar / pronunciation fixes before TTS.
 * Display script may stay unchanged upstream — call only in speech pipeline.
 */

const LATIN_RUN =
  /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9''.\-&]{0,}(?:\s+(?![.!?…]\s)[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9''.\-&]{0,})*/;

/** «визитным камушком» и прочие LLM-галлюцинации → устойчивое «визитной карточкой». */
function fixCallingCardMalapropisms(text: string): string {
  return text
    .replace(/визитн\w*\s+камуш\w*/gi, 'визитной карточкой')
    .replace(/визитн\w*\s+камн\w*/gi, 'визитной карточкой');
}

/** «с лёгкостью поп-музыка» → родительный «поп-музыки» / «попмузыки». */
function fixPopMusicGenitive(text: string): string {
  let result = text;
  result = result.replace(
    /(лёгкост\w*|легкост\w*|лёгк\w*|легк\w*)\s+(?:поп[\s-]*музык(?:а|у|ой|е|ою)|попмузык(?:а|у|ой|е|ою))/gi,
    '$1 попмузыки',
  );
  result = result.replace(
    /(лёгкост\w*|легкост\w*|лёгк\w*|легк\w*)\s+поп[\s-]музык(?:а|у|ой|е|ою)/gi,
    '$1 поп-музыки',
  );
  return result;
}

/** Дуэты/коллабы: «The Chemical Brothers и Q-Tip» → «… and Q-Tip» одной EN-фразой. */
export function mergeLatinCollaborationPhrases(text: string): string {
  const re = new RegExp(`(${LATIN_RUN.source})\\s+и\\s+(${LATIN_RUN.source})`, 'gi');
  let prev = '';
  let result = text;
  while (result !== prev) {
    prev = result;
    result = result.replace(re, '$1 and $2');
  }
  return result;
}

/** Кириллическая «транслитерация» названия трека → латиница из метаданных (STARTAFIGHT). */
export function restoreLatinTrackTitleInSpeech(text: string, title: string): string {
  const t = title.trim();
  if (!t || !/[A-Za-z]/.test(t)) return text;
  if (text.includes(t)) return text;

  const ruFromTitle = latinLettersToCyrillicApprox(t.replace(/[^A-Za-z]/g, ''));
  if (ruFromTitle.length >= 4) {
    const ruRe = new RegExp(`\\b${ruFromTitle}\\b`, 'gi');
    if (ruRe.test(text.replace(LATIN_RUN, ' '))) {
      return text.replace(ruRe, t);
    }
  }

  const ruAlt = ruFromTitle.replace(/х/g, '');
  if (ruAlt.length >= 4 && ruAlt !== ruFromTitle) {
    const ruRe = new RegExp(`\\b${ruAlt}\\b`, 'gi');
    if (ruRe.test(text.replace(LATIN_RUN, ' '))) {
      return text.replace(ruRe, t);
    }
  }

  return text;
}

function latinLettersToCyrillicApprox(word: string): string {
  const map: Record<string, string> = {
    a: 'а',
    b: 'б',
    c: 'к',
    d: 'д',
    e: 'е',
    f: 'ф',
    g: 'г',
    h: 'х',
    i: 'и',
    j: 'дж',
    k: 'к',
    l: 'л',
    m: 'м',
    n: 'н',
    o: 'о',
    p: 'п',
    q: 'к',
    r: 'р',
    s: 'с',
    t: 'т',
    u: 'у',
    v: 'в',
    w: 'в',
    x: 'кс',
    y: 'и',
    z: 'з',
  };
  return word
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('');
}

export function fixTtsGrammarIssues(
  text: string,
  options: { artist?: string; title?: string } = {},
): string {
  let result = text;
  result = fixCallingCardMalapropisms(result);
  result = fixPopMusicGenitive(result);
  result = mergeLatinCollaborationPhrases(result);
  if (options.title?.trim()) {
    result = restoreLatinTrackTitleInSpeech(result, options.title);
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}
