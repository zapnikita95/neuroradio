import { cleanTrackTitleForSearch } from './title-clean.js';

const INTERVIEW_SITES = [
  'site:npr.org',
  'site:pitchfork.com',
  'site:rollingstone.com',
  'site:genius.com',
  'site:theguardian.com',
  'site:billboard.com',
];

export interface DeepSearchQuerySet {
  /** Broad interview / meaning queries */
  primary: string[];
  /** Tier-1 media sites */
  press: string[];
  /** Artist biography fallback (scope=artist only) */
  artistBio: string[];
}

function quoted(s: string): string {
  const t = s.trim();
  if (/^the\s+/i.test(t) || t.split(/\s+/).length >= 2) return `"${t}"`;
  return t;
}

export function buildDeepSearchQueries(artist: string, title: string): DeepSearchQuerySet {
  const cleanTitle = cleanTrackTitleForSearch(title);
  const artistQ = quoted(artist);
  const isRu = /[\u0400-\u04FF]/.test(artist + title);

  if (isRu) {
    const lead = artist.trim().toLowerCase() === 'кино' ? 'Виктор Цой Кино' : artist;
    return {
      primary: [
        `"${lead}" "${cleanTitle}" интервью смысл`,
        `"${lead}" "${cleanTitle}" история песни`,
        `${lead} ${cleanTitle} о чём песня`,
      ],
      press: [
        `${lead} ${cleanTitle} интервью site:rap.ru OR site:the-flow.ru`,
        `${lead} ${cleanTitle} site:wikipedia.org`,
      ],
      artistBio: [`${lead} музыкант биография`, `"${lead}" артист интервью`],
    };
  }

  const siteClause = INTERVIEW_SITES.slice(0, 4).join(' OR ');
  return {
    primary: [
      `${artistQ} "${cleanTitle}" interview meaning`,
      `${artistQ} "${cleanTitle}" song story behind`,
      `${artistQ} "${cleanTitle}" Dave Bayley OR frontman OR wrote about`,
    ],
    press: [
      `${artistQ} "${cleanTitle}" (${siteClause})`,
      `${artistQ} "${cleanTitle}" interview site:genius.com`,
    ],
    artistBio: [
      `${artistQ} band biography interview`,
      `${artistQ} musician formed met school`,
    ],
  };
}

/** Flat list for providers that take one query at a time (max N). */
export function flattenDeepSearchQueries(artist: string, title: string, max = 6): string[] {
  const set = buildDeepSearchQueries(artist, title);
  const all = [...set.primary, ...set.press];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of all) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= max) break;
  }
  return out;
}
