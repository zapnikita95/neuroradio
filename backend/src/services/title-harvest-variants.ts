/** Title variants for Last.fm / Genius lookup — strip store suffixes, feat blocks. */
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

  let t = raw;
  t = t.replace(/\s*\(feat\.[^)]+\)/gi, '');
  t = t.replace(/\s*\(ft\.[^)]+\)/gi, '');
  t = t.replace(/\s*\(featuring[^)]+\)/gi, '');
  t = t.replace(/\s*\(with[^)]+\)/gi, '');
  t = t.replace(/\s*\(Single\)/gi, '');
  t = t.replace(/\s*\(Radio Edit\)/gi, '');
  t = t.replace(/\s*\(Album Version\)/gi, '');
  t = t.replace(/\s*\(Remaster(?:ed)?[^)]*\)/gi, '');
  t = t.replace(/\s*\([^)]*(?:remaster|radio edit|explicit|version|mix|live|mono|stereo|deluxe|bonus)[^)]*\)/gi, '');
  t = t.replace(/\s*\[[^\]]*\]/g, '');
  push(t);

  const beforeParen = raw.split('(')[0]?.trim();
  if (beforeParen && beforeParen.length >= 3) push(beforeParen);

  return out;
}
