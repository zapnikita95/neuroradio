/** Reject mythology / disambiguation pages when resolving artist Wikipedia for music stories. */

const NON_MUSIC_WIKI_RE =
  /\b(?:mythology|legend|archer|fictional character|may refer to|disambiguation|hero of|ancient persian|greek myth|roman myth|biblical|saint)\b/i;

const MUSIC_WIKI_RE =
  /\b(?:singer|musician|rapper|band|album|single|song|record|pop|hip hop|electronic|producer|DJ|artist|composer|vocalist|discography|music video|Billboard|Grammy)\b/i;

export function isMusicArtistWikiExtract(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 40) return false;
  if (NON_MUSIC_WIKI_RE.test(trimmed)) return false;
  return MUSIC_WIKI_RE.test(trimmed);
}

/** Prefer musician/singer pages for short artist names (Arash, Moby, …). */
export function buildMusicFirstWikiCandidates(primary: string): string[] {
  const short = primary.trim().split(/\s+/).length === 1 && primary.trim().length <= 12;
  const base = [
    `${primary} (singer)`,
    `${primary} (musician)`,
    `${primary} (rapper)`,
    `${primary} (band)`,
    `${primary} (musical group)`,
    primary,
  ];
  return short ? base : [primary, ...base.filter((t) => t !== primary)];
}
