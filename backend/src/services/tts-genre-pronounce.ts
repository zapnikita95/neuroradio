/**
 * Hyphenated genre labels confuse RU TTS (Edge/Yandex): «хип-хоп артист» → «хипа хап».
 * Merge compounds into one token without hyphen-driven inflection.
 *
 * Note: JS `\b` is ASCII-only — use Unicode lookaround for Cyrillic tokens.
 */

const WB_BEFORE = '(?<![\\p{L}\\p{N}_])';
const WB_AFTER = '(?![\\p{L}\\p{N}_])';

function genreRe(core: string, flags = 'giu'): RegExp {
  return new RegExp(`${WB_BEFORE}${core}${WB_AFTER}`, flags);
}

const GENRE_TTS_REPLACEMENTS: Array<[RegExp, string]> = [
  // hip-hop
  [genreRe('хип[\\s-]+хоп'), 'хипхоп'],
  [genreRe('hip[\\s-]+hop'), 'хипхоп'],

  // pop / rock
  [genreRe('поп[\\s-]+музык(?:а|и|у|ой|е|ою)?'), 'попмузыка'],
  [genreRe('pop[\\s-]+music'), 'попмузыка'],
  [genreRe('поп[\\s-]+рок'), 'попрок'],
  [genreRe('pop[\\s-]+rock'), 'попрок'],
  [genreRe('рок[\\s-]+музык(?:а|и|у|ой|е|ою)?'), 'рокмузыка'],
  [genreRe('rock[\\s-]+music'), 'рокмузыка'],

  // rock-n-roll
  [genreRe('рок[\\s-]+н[\\s-]+ролл'), 'рокэнролл'],
  [genreRe('rock[\\s-]+n[\\s-]+roll'), 'рокэнролл'],
  [genreRe('rock[\\s-]+and[\\s-]+roll'), 'рокэнролл'],

  // folk / indie / alt
  [genreRe('фолк[\\s-]+рок'), 'фолкрок'],
  [genreRe('folk[\\s-]+rock'), 'фолкрок'],
  [genreRe('инди[\\s-]+рок'), 'индирок'],
  [genreRe('indie[\\s-]+rock'), 'индирок'],
  [genreRe('альт[\\s-]+рок'), 'альтрок'],
  [genreRe('alt[\\s-]+rock'), 'альтрок'],

  // metal / punk / electronic
  [genreRe('ню[\\s-]+метал'), 'нюметал'],
  [genreRe('nu[\\s-]+metal'), 'нюметал'],
  [genreRe('хэви[\\s-]+метал'), 'хэвиметал'],
  [genreRe('heavy[\\s-]+metal'), 'хэвиметал'],
  [genreRe('дэт[\\s-]+метал'), 'дэт-м+етал'],
  [genreRe('death[\\s-]+metal'), 'дэт-м+етал'],
  [genreRe('дэтметал'), 'дэт-м+етал'],
  [genreRe('поп[\\s-]+панк'), 'поппанк'],
  [genreRe('pop[\\s-]+punk'), 'поппанк'],
  [genreRe('пост[\\s-]+панк'), 'постпанк'],
  [genreRe('post[\\s-]+punk'), 'постпанк'],
  [genreRe('синти[\\s-]+поп'), 'синтипоп'],
  [genreRe('synth[\\s-]+pop'), 'синтипоп'],
  [genreRe('электро[\\s-]+поп'), 'электропоп'],
  [genreRe('electro[\\s-]+pop'), 'электропоп'],
  [genreRe('дип[\\s-]+хаус'), 'дипхаус'],
  [genreRe('deep[\\s-]+house'), 'дипхаус'],
  [genreRe('техно[\\s-]+поп'), 'технопоп'],
  [genreRe('tech[\\s-]+pop'), 'технопоп'],

  // rap / R&B / K-pop
  [genreRe('рэп[\\s-]+музык(?:а|и|у|ой|е)?'), 'рэпмузыка'],
  [genreRe('rap[\\s-]+music'), 'рэпмузыка'],
  [genreRe('ар[\\s-]+энд[\\s-]+би'), 'рэндби'],
  [genreRe('ар[\\s-]+эн[\\s-]+би'), 'рэндби'],
  [genreRe('р[\\s]*&[\\s]*б'), 'рэндби'],
  [genreRe('р[\\s]*&[\\s]*b'), 'рэндби'],
  [genreRe('к[\\s-]+поп'), 'кпоп'],
  [genreRe('k[\\s-]+pop'), 'кпоп'],
  [genreRe('к-pop'), 'кпоп'],
  [genreRe("r'n'b|rnb"), 'рэндби'],
];

/** Genre / subgenre tokens for Russian speech synthesis. */
export function normalizeGenreTermsForTts(text: string): string {
  if (!text.trim()) return text;
  let result = text;
  for (const [pattern, replacement] of GENRE_TTS_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
