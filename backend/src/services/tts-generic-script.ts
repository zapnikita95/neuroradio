/** Убираем латинские названия трека/артиста из озвучки — русские замены. Кириллица остаётся. */

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickVariant(seed: string, count: number): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % count;
}

/** Лatin / EN title or artist — кириллические названия не трогаем. */
export function isPrimarilyLatin(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const latin = (trimmed.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const cyrillic = (trimmed.match(/[а-яёА-ЯЁ]/g) ?? []).length;
  if (latin === 0) return false;
  return latin >= cyrillic;
}

function phraseVariants(phrase: string): string[] {
  const base = phrase.trim();
  const withoutParens = base.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const withoutArticle = base.replace(/^(the|a|an)\s+/i, '').trim();
  const variants = [base, withoutParens, withoutArticle].filter((v) => v.length >= 2);
  return variants.filter((v, i, arr) => arr.indexOf(v) === i);
}

const ARTICLE_PREFIX = /^(the|a|an)\s+/i;

/** Лatin-токены трека/артиста для blocklist в TTS и доп. замены («The Offspring» → «Offspring»). */
export function latinTrackBlocklist(artist: string, title: string): Set<string> {
  const blocked = new Set<string>();
  const addPhrase = (phrase: string) => {
    if (!isPrimarilyLatin(phrase)) return;
    for (const variant of phraseVariants(phrase)) {
      for (const part of variant.split(/[^\p{L}\p{N}]+/u)) {
        const word = part.trim().toLowerCase();
        if (word.length >= 2 && /[a-z]/.test(word)) blocked.add(word);
      }
      const noArticle = variant.replace(ARTICLE_PREFIX, '').trim();
      if (noArticle.length >= 2) {
        for (const part of noArticle.split(/[^\p{L}\p{N}]+/u)) {
          const word = part.trim().toLowerCase();
          if (word.length >= 2 && /[a-z]/.test(word)) blocked.add(word);
        }
      }
      const paren = variant.match(/\(([^)]+)\)/);
      if (paren?.[1]?.trim() && isPrimarilyLatin(paren[1])) {
        for (const part of paren[1].split(/[^\p{L}\p{N}]+/u)) {
          const word = part.trim().toLowerCase();
          if (word.length >= 2 && /[a-z]/.test(word)) blocked.add(word);
        }
      }
    }
  };
  addPhrase(artist);
  addPhrase(title);
  blocked.delete('the');
  blocked.delete('a');
  blocked.delete('an');
  return blocked;
}

function latinAliasPhrases(phrase: string): string[] {
  if (!isPrimarilyLatin(phrase)) return [];
  const aliases: string[] = [];
  for (const variant of phraseVariants(phrase)) {
    const noArticle = variant.replace(ARTICLE_PREFIX, '').trim();
    if (noArticle && noArticle !== variant && noArticle.length >= 3) {
      aliases.push(noArticle);
    }
    const paren = variant.match(/\(([^)]+)\)/);
    if (paren?.[1]?.trim() && isPrimarilyLatin(paren[1]) && paren[1].trim().length >= 3) {
      aliases.push(paren[1].trim());
    }
  }
  return aliases.filter((v, i, arr) => arr.indexOf(v) === i);
}

const TRACK_SUBSTITUTES = [
  'эта песня',
  'этот трек',
  'эта композиция',
  'в треке',
  'у этой песни',
  'в этой композиции',
];

const ARTIST_SUBSTITUTES = [
  'исполнитель',
  'артист',
  'музыкант',
  'группа',
];

function pickSubstitute(seed: string, options: string[]): string {
  return options[pickVariant(seed, options.length)]!;
}

function replaceLatinPhrase(
  text: string,
  phrase: string,
  substitutes: string[],
  seedPrefix: string,
): string {
  if (!phrase.trim() || !isPrimarilyLatin(phrase)) return text;

  let result = text;
  for (const variant of phraseVariants(phrase)) {
    const escaped = escapeRe(variant);
    let counter = 0;
    const next = () => pickSubstitute(`${seedPrefix}|${variant}|${counter++}`, substitutes);

    result = result.replace(new RegExp(`«\\s*${escaped}\\s*»`, 'gi'), next);
    result = result.replace(new RegExp(`[\\u201c""]\\s*${escaped}\\s*[\\u201d""]`, 'gi'), next);
    result = result.replace(new RegExp(`'\\s*${escaped}\\s*'`, 'gi'), next);
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), next);
  }
  return result;
}

function stripLatinArtistAfterOt(text: string, artist: string): string {
  if (!isPrimarilyLatin(artist)) return text;
  let result = text;
  for (const variant of phraseVariants(artist)) {
    const escaped = escapeRe(variant);
    result = result.replace(new RegExp(`\\s+от\\s+${escaped}\\b`, 'gi'), '');
  }
  return result;
}

function rewriteLead(script: string, title: string, artist: string): string {
  const stripTitle = isPrimarilyLatin(title);
  const stripArtist = isPrimarilyLatin(artist);

  const leadRe = new RegExp(
    `^${escapeRe(title)}\\s+от\\s+${escapeRe(artist)}(\\s*[—–-]\\s*|\\s+)`,
    'i',
  );
  const m = script.match(leadRe);

  if (m) {
    const rest = script.slice(m[0].length).trim();
    const dashLead = /[—–-]\s*$/.test(m[0]) || /^[—–-]/.test(rest);

    if (!stripTitle && stripArtist) {
      const body = rest.replace(/^[—–-]\s*/, '');
      return dashLead ? `${title.trim()} — ${body}` : `${title.trim()} ${body}`;
    }

    if (!stripTitle) return script;

    const v = pickVariant(`${title}|${artist}`, 5);

    if (dashLead) {
      const body = rest.replace(/^[—–-]\s*/, '');
      const templates = [
        `У этой песни тот самый ${body}`,
        `Эта композиция построена на запоминающемся ${body.replace(/^гитарный рифф/i, 'гитарном рифе')}`,
        `Этот хит держится на ${body.replace(/^гитарный рифф/i, 'гитарном рифе')}`,
        `Сейчас в эфире песня с ${body.replace(/^гитарный рифф/i, 'гитарным рифом')}`,
        `Сейчас играет песня с тем самым ${body}`,
      ];
      return templates[v]!;
    }

    const templates = [
      `Эта песня ${rest}`,
      `Эта композиция ${rest}`,
      `Этот хит ${rest.replace(/^вышел\b/i, 'появился').replace(/^неожиданно возглавил/i, 'неожиданно возглавил')}`,
      `Текущий трек ${rest}`,
      `В эфире сейчас классика, которая ${rest.replace(/^вышел\b/i, 'вышла').replace(/^неожиданно возглавил/i, 'неожиданно возглавила')}`,
    ];
    return templates[v]!;
  }

  if (!stripTitle) return script;

  const titleOnlyRe = new RegExp(`^${escapeRe(title)}(\\s*[—–-]\\s*|\\s+)`, 'i');
  const tm = script.match(titleOnlyRe);
  if (!tm) return script;

  const rest = script.slice(tm[0].length).trim().replace(/^[—–-]\s*/, '');
  const v = pickVariant(title, 5);
  const templates = [
    `Эта песня ${rest}`,
    `Этот трек ${rest}`,
    `В треке ${rest}`,
    `У этой песни ${rest}`,
    `Сейчас в эфире ${rest}`,
  ];
  return templates[v]!;
}

function cleanupAfterGenericize(text: string): string {
  return text
    .replace(/\b(эта песня|этот трек|эта композиция|в треке|у этой песни)\s+\1\b/giu, '$1')
    .replace(/\s+,\s*,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/([—–-])\s*\1+/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();
}

/**
 * Заменяет латинские «Title от Artist» и вхождения в тексте на русские указательные формулировки
 * перед TTS, когда пользователь выключил «названия треков в озвучке».
 * Кириллические названия треков сохраняются.
 */
export function genericizeScriptForVoiceover(
  script: string,
  artist: string,
  title: string,
): string {
  const trimmed = script.trim();
  if (!trimmed) return trimmed;

  const stripTitle = isPrimarilyLatin(title);
  const stripArtist = isPrimarilyLatin(artist);
  if (!stripTitle && !stripArtist) return trimmed;

  let result = rewriteLead(trimmed, title, artist);
  result = stripLatinArtistAfterOt(result, artist);
  if (stripTitle) {
    result = replaceLatinPhrase(result, title, TRACK_SUBSTITUTES, 'track');
    for (const alias of latinAliasPhrases(title)) {
      result = replaceLatinPhrase(result, alias, TRACK_SUBSTITUTES, 'track-alias');
    }
  }
  if (stripArtist) {
    result = replaceLatinPhrase(result, artist, ARTIST_SUBSTITUTES, 'artist');
    for (const alias of latinAliasPhrases(artist)) {
      result = replaceLatinPhrase(result, alias, ARTIST_SUBSTITUTES, 'artist-alias');
    }
  }

  result = result
    .replace(/\bPeppers\b/gi, 'группа')
    .replace(/\bMTV\b/gi, 'МТВ');

  return cleanupAfterGenericize(result);
}
