/** Убираем SEO-мусор из скобок; feat/remix/live не трогаем. */

const JUNK_PAREN_INNER =
  /^(?:official\s+(?:music\s+)?video|official\s+video|official\s+audio|music\s+video|video|mv|lyrics|audio|visualizer|visualiser|prod\.?|slowed(?:\s*\+\s*reverb)?|sped\s*up|extended|radio\s+edit|clean\s+version|explicit|hd|4k|8k|vertical|shorts?)$/i;

const SNIPPET_PLATFORM_SPLIT =
  /\s[-–—|]\s*(?:YouTube|Spotify|Apple Music|SoundCloud|Genius|Shazam|Musixmatch|Last\.fm|Deezer)\.?\s+/i;

const SNIPPET_PLATFORM_TAIL =
  /\s[-–—|]\s*(?:YouTube|Spotify|Apple Music|SoundCloud|Genius|Shazam|Musixmatch|Last\.fm|Deezer)\b[\s\S]*$/i;

/** Для web/MB запросов: «Cuppa Tea (Official Video)» → «Cuppa Tea», «X (feat. Y)» остаётся. */
export function cleanTrackTitleForSearch(title: string): string {
  return title
    .replace(/\(([^)]*)\)/g, (full, inner: string) =>
      JUNK_PAREN_INNER.test(inner.trim()) ? ' ' : full,
    )
    .replace(/\s*\[[^\]]*\]\s*/g, (full, offset, whole) => {
      const inner = whole.slice(whole.indexOf('[', offset) + 1, whole.indexOf(']', offset));
      return JUNK_PAREN_INNER.test(inner.trim()) ? ' ' : full;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Сниппет DDG/HTML: убираем хвост «- YouTube…», не трогаем биографию в скобках. */
export function stripSnippetBoilerplate(snippet: string): string {
  let s = snippet.trim();
  s = s.replace(/\s*\(\s*official\s+(?:music\s+)?video\s*\)/gi, '');
  const parts = s.split(SNIPPET_PLATFORM_SPLIT);
  if (parts.length > 1) {
    const tail = parts.slice(1).join(' ').trim();
    if (tail.length >= 20 && !/^(?:share|listen|watch|provided to|sign in|create an account)/i.test(tail)) {
      s = tail;
    } else {
      s = parts[0]!.trim();
    }
  } else {
    s = s.replace(SNIPPET_PLATFORM_TAIL, '');
  }
  return s.replace(/\s+/g, ' ').trim();
}

export function isJunkParenthetical(inner: string): boolean {
  return JUNK_PAREN_INNER.test(inner.trim());
}
