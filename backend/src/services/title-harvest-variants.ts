/** Title variants for Last.fm / Genius / fact-bank lookup — strip store suffixes, feat blocks. */

const PAREN_STRIP_PATTERNS: RegExp[] = [
  /\s*\(feat\.[^)]+\)/gi,
  /\s*\(ft\.[^)]+\)/gi,
  /\s*\(featuring[^)]+\)/gi,
  /\s*\(with[^)]+\)/gi,
  /\s*\(Single\)/gi,
  /\s*\(Radio Edit\)/gi,
  /\s*\(Album Version\)/gi,
  /\s*\(Remaster(?:ed)?[^)]*\)/gi,
  /\s*\([^)]*(?:remaster|radio edit|explicit|version|mix|live|mono|stereo|deluxe|bonus)[^)]*\)/gi,
];

function stripHarvestParentheticalsOnce(title: string): string {
  let t = title;
  for (const re of PAREN_STRIP_PATTERNS) t = t.replace(re, '');
  t = t.replace(/\s*\[[^\]]*\]/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

/** Iteratively strip feat/Single/remaster blocks until stable. */
export function stripHarvestParentheticals(title: string): string {
  let t = title.trim();
  if (!t) return '';
  for (let i = 0; i < 6; i++) {
    const next = stripHarvestParentheticalsOnce(t);
    if (next === t) break;
    t = next;
  }
  return t;
}

export function harvestTitleVariants(title: string): string[] {
  const raw = title.trim();
  if (!raw) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const n = t.replace(/\s+/g, ' ').trim();
    if (n.length < 2) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };

  push(raw);
  push(stripHarvestParentheticals(raw));

  const beforeParen = raw.split('(')[0]?.trim();
  if (beforeParen && beforeParen.length >= 3) push(beforeParen);

  const stripped = stripHarvestParentheticals(raw);
  const strippedBeforeParen = stripped.split('(')[0]?.trim();
  if (strippedBeforeParen && strippedBeforeParen.length >= 3) push(strippedBeforeParen);

  return out;
}

/** Shortest useful title for API lookups (prod + bulk). */
export function primaryHarvestLookupTitle(title: string): string {
  const variants = harvestTitleVariants(title);
  if (variants.length === 0) return title.trim();
  return variants.reduce((best, v) => (v.length < best.length ? v : best));
}
