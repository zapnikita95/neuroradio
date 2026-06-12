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

type GenreReplacement = [RegExp, string | ((...args: string[]) => string)];

function musykaMerge(stem: string) {
  return (_match: string, ending?: string) => `${stem}музык${ending || 'а'}`;
}

const GENRE_TTS_REPLACEMENTS: GenreReplacement[] = [
  // hip-hop
  [genreRe('хип[\\s-]+хоп'), 'хипхоп'],
  [genreRe('hip[\\s-]+hop'), 'хипхоп'],

  // pop / rock — сохраняем падеж: поп-музыкой → попмузыкой
  [genreRe('поп[\\s-]+музык(а|и|у|ой|е|ою)?'), musykaMerge('поп')],
  [genreRe('pop[\\s-]+music'), 'попмузыка'],
  [genreRe('поп[\\s-]+рок'), 'попрок'],
  [genreRe('pop[\\s-]+rock'), 'попрок'],
  [genreRe('рок[\\s-]+музык(а|и|у|ой|е|ою)?'), musykaMerge('рок')],
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

  // metal — ударение на «е» в -метал; отдельно «металл» → мет+алл (ниже)
  [genreRe('дэт[\\s-]+метал(а|у|ом|е|ы|и|)?'), 'дэт-м+етал$1'],
  [genreRe('death[\\s-]+metal'), 'дэт-м+етал'],
  [genreRe('дэтметал'), 'дэт-м+етал'],
  [genreRe('(?:ну|ню|nu)[\\s-]+метал(а|у|ом|е|ы|и|)?'), 'ню м+етал$1'],
  [genreRe('(?:ну|ню|nu)[\\s-]+метал'), 'ню м+етал'],
  [genreRe('nu[\\s-]+metal'), 'ню м+етал'],
  [genreRe('нюметал'), 'ню м+етал'],
  [genreRe('хэви[\\s-]+метал(а|у|ом|е|ы|и|)?'), 'хэви м+етал$1'],
  [genreRe('heavy[\\s-]+metal'), 'хэви м+етал'],
  [genreRe('хэвиметал'), 'хэви м+етал'],
  [genreRe('метал[\\s-]+рок'), 'м+етал рок'],
  [genreRe('metal[\\s-]+rock'), 'м+етал рок'],
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
  [genreRe('рэп[\\s-]+музык(а|и|у|ой|е|ою)?'), musykaMerge('рэп')],
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

/** «Металл» отдельным словом (не жанр *-метал, не «металлист*»). */
export function normalizeStandaloneMetallForTts(text: string): string {
  return text.replace(
    /(?<![\p{L}\p{N}_+\-])металл(?!ист)(ами|ах|ов|ом|у|е|ы|и|а|)(?![\p{L}\p{N}_])/giu,
    'мет+алл$1',
  );
}

/** «между … и поп-музыку» → творительный попмузыкой. */
export function fixGenreCaseAfterBetween(text: string): string {
  return text.replace(
    /(между\s+(?:[\p{L}\p{N}+\-]+\s+){1,8}и\s+)(?:поп[\s-]*)?(?:музык(?:ой|а|у|е|и|ою)|попмузык(?:ой|а|у|е|и|ою))(?=[\s,.!?;:]|$)/giu,
    '$1попмузыкой',
  );
}

/** Genre / subgenre tokens for Russian speech synthesis. */
export function normalizeGenreTermsForTts(text: string): string {
  if (!text.trim()) return text;
  let result = text;
  for (const [pattern, replacement] of GENRE_TTS_REPLACEMENTS) {
    if (typeof replacement === 'function') {
      result = result.replace(pattern, replacement as (...args: string[]) => string);
    } else {
      result = result.replace(pattern, replacement);
    }
  }
  result = fixGenreCaseAfterBetween(result);
  result = normalizeStandaloneMetallForTts(result);
  return result;
}
