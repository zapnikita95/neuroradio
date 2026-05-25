/** Reject Wikipedia/DDG sentences about the wrong band (Van Halen for Dj Jump, etc.). */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function artistTokens(artist: string): string[] {
  return normalize(artist)
    .split(' ')
    .filter((part) => part.length >= 2);
}

const KNOWN_FOREIGN_ACTS = [
  'van halen',
  'bomfunk mc',
  'bomfunk',
  'rick ross',
  'eminem',
  'madonna',
  'the beatles',
  'led zeppelin',
  'michael jackson',
  'britney spears',
  'taylor swift',
  'beyonce',
  'kanye west',
  'dr dre',
  'snoop dogg',
  'jay z',
  'queen',
  'nirvana',
  'metallica',
  'coldplay',
];

/** Another act is the grammatical subject (e.g. «Van Halen's most successful single»). */
export function factNamesForeignEntity(fact: string, artist: string, title: string): boolean {
  const norm = normalize(fact);
  const artistNorm = normalize(artist);
  const titleNorm = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  const tokens = artistTokens(artist);

  for (const foreign of KNOWN_FOREIGN_ACTS) {
    if (!norm.includes(foreign)) continue;
    if (artistNorm.includes(foreign) || titleNorm.includes(foreign)) continue;
    return true;
  }

  const possessive = [...norm.matchAll(/\b([a-z0-9][a-z0-9\s]{1,24})'s\b/g)];
  for (const [, subject] of possessive) {
    const subj = subject.trim();
    if (subj.length < 3) continue;
    if (artistNorm.includes(subj) || titleNorm.includes(subj)) continue;
    const overlaps = tokens.length > 0 && tokens.every((t) => subj.includes(t) || norm.includes(t));
    if (!overlaps) return true;
  }

  const properLead = [
    ...fact.matchAll(
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?:'s|\s+(?:is|was|are|were|has|had))\b/g,
    ),
  ];
  for (const [, name] of properLead) {
    const n = normalize(name);
    if (n.length < 4) continue;
    if (artistNorm.includes(n) || titleNorm.includes(n)) continue;
    if (tokens.length > 0 && tokens.every((t) => n.includes(t))) continue;
    return true;
  }

  return false;
}

export function factMentionsArtist(fact: string, artist: string): boolean {
  const tokens = artistTokens(artist);
  const norm = normalize(fact);
  if (tokens.length === 0) return false;
  if (tokens.every((token) => norm.includes(token))) return true;
  const artistNorm = normalize(artist);
  return artistNorm.length >= 3 && norm.includes(artistNorm);
}

export function factMentionsTitle(fact: string, title: string): boolean {
  const titleNorm = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  if (titleNorm.length < 4) return false;
  return normalize(fact).includes(titleNorm);
}

/** Fact must belong to this artist/title — not a neighbour sentence from the wrong wiki page. */
export function factAppliesToRequest(
  fact: string,
  artist: string,
  title: string,
  scope: 'artist' | 'track',
): boolean {
  const trimmed = fact.trim();
  if (trimmed.length < 35) return false;
  if (factNamesForeignEntity(trimmed, artist, title)) return false;

  const mentionsArtist = factMentionsArtist(trimmed, artist);
  const mentionsTitle = factMentionsTitle(trimmed, title);

  if (scope === 'artist') {
    return mentionsArtist;
  }
  return mentionsTitle || mentionsArtist;
}
