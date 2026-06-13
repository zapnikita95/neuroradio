/**
 * Systemic guard: every seed for artist+title must anchor to THAT track.
 * Blocks cross-song wiki bleed, place-name collisions, and career bios on track requests.
 */

import {
  factMentionsOtherTrackTitle,
  factMentionsTitle,
  hasRussianTrackContextSignal,
  hasTrackContextSignal,
  isNonMusicTitleCollisionFact,
} from './fact-relevance.js';

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Single-word titles that collide with cities/regions in encyclopedia text. */
const PLACE_NAME_TITLES = new Set(
  [
    'chicago',
    'georgia',
    'paris',
    'america',
    'california',
    'london',
    'moscow',
    'berlin',
    'boston',
    'miami',
    'dallas',
    'houston',
    'phoenix',
    'detroit',
    'memphis',
    'nashville',
    'vegas',
    'hollywood',
    'brooklyn',
    'texas',
    'alabama',
    'colorado',
    'arizona',
    'baltimore',
    'denver',
    'orlando',
    'savannah',
  ].map(normalize),
);

const PLACE_COLLISION_PATTERNS: RegExp[] = [
  /\b(?:city of|site of the city|first known reference to|Checagou|memoir|La Salle|settled by|colonists)\b/i,
  /\b(?:geographical|geographic|municipality|populated place|capital of the state)\b/i,
];

const ALIEN_SONG_ORIGIN_PATTERNS: RegExp[] = [
  /^It was originally written\b/i,
  /^It was written by\b/i,
  /^The song was originally written\b/i,
  /\boriginally written by\b/i,
  /\bbased on a conversation (?:he|she|they) had\b/i,
  /\bkeyboardist\s+[A-Z][\w-]+(?:\s+[A-Z][\w-]+)?\b/i,
  /\bSteve Porcaro\b/i,
];

const ARTIST_CAREER_BIO_PATTERNS: RegExp[] = [
  /\b(?:originally )?started as a (?:duo|duet|band|group)\b/i,
  /\bbegan as a (?:duo|duet|band|group)\b/i,
  /\bbefore transitioning to a solo\b/i,
  /\btransitioned to a solo career\b/i,
  /\b(?:band|group|duo)\s+formed in\b/i,
  /\b(?:is|was)\s+(?:an?\s+)?(?:\w+\s+){0,4}(?:band|group|artist|duo|trio)\s+formed\s+in\b/i,
  /(?:^|[\s,.])начинал\w*\s+как\s+дуэт/i,
  /(?:^|[\s,.])начал\w*\s+как\s+дуэт/i,
  /как\s+дуэт\s+с\s+[А-ЯA-ZЁ]/u,
  /переход\s+из\s+дуэта\s+в\s+сольн/i,
  /переш[ёе]л\w*\s+в\s+сольн/i,
  /стал\s+сольн\w*\s+проект/i,
  /(?:^|[\s,.])образовал\w*\s+(?:групп|коллектив|дуэт)/i,
];

const CATALOG_METADATA_PATTERNS: RegExp[] = [
  /\b(?:Last\.fm|Discogs)\b/i,
  /\b(?:track «|трек «).*(?:» на (?:Last\.fm|Discogs)|album «)/i,
  /\b(?:на лейбле|выходил на лейбле)\b/i,
  /трек «[^»]+» идёт \d+:\d+/i,
];

/** Song-origin narrative without naming the requested track (Human Nature → Chicago). */
export function isAlienSongOriginFact(fact: string, title: string): boolean {
  if (factMentionsTitle(fact, title)) return false;
  const t = fact.trim();
  if (!ALIEN_SONG_ORIGIN_PATTERNS.some((p) => p.test(t))) return false;
  if (/\b(?:Porcaro|Steve Porcaro)\b/i.test(t)) return true;
  if (/^It was originally written\b/i.test(t)) return true;
  if (/\bbased on a conversation\b/i.test(t)) return true;
  if (/\boriginally written by\b/i.test(t)) return true;
  return false;
}

/** City/region encyclopedia matched a song title token (Chicago the city). */
export function isPlaceNameTitleCollision(fact: string, title: string, artist: string): boolean {
  const titleToken = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  if (!PLACE_NAME_TITLES.has(titleToken)) return false;
  const factNorm = normalize(fact);
  if (!factNorm.includes(titleToken)) return false;

  if (PLACE_COLLISION_PATTERNS.some((p) => p.test(fact))) return true;
  if (/\b(?:city|site|reference|memoir|La Salle|Checagou)\b/i.test(fact)) return true;

  if (
    factMentionsTitle(fact, title) &&
    (hasAnchoredTrackContext(fact, title) ||
      /\b(?:song|single|track|released|recorded|album)\b/i.test(fact))
  ) {
    return false;
  }

  return false;
}

/** Duo/formation/solo-transition — not a fact about this specific track. */
export function isArtistCareerBioWithoutTrack(fact: string, title: string): boolean {
  if (factMentionsTitle(fact, title)) return false;
  return ARTIST_CAREER_BIO_PATTERNS.some((p) => p.test(fact));
}

/** Stricter track context — «It was originally written» is NOT enough without the title. */
export function hasAnchoredTrackContext(fact: string, title: string): boolean {
  if (factMentionsTitle(fact, title)) return true;
  const trimmed = fact.trim();
  if (isAlienSongOriginFact(trimmed, title)) return false;
  if (/^It was originally written\b/i.test(trimmed)) return false;
  if (/^It was written by\b/i.test(trimmed) && !/\bthis (?:song|track|single)\b/i.test(trimmed)) {
    return false;
  }
  return hasTrackContextSignal(trimmed) || hasRussianTrackContextSignal(trimmed);
}

export interface TrackAnchorOptions {
  trackPoolFacts?: string[];
}

/**
 * true → reject this seed for a story about `artist` — `title`.
 * Used at pick, ingest, LLM hunt validation, and bank purge.
 */
export function rejectSeedForTrackStory(
  fact: string,
  artist: string,
  title: string,
  options: TrackAnchorOptions = {},
): boolean {
  if (!title.trim()) return false;
  const trimmed = fact.trim();
  if (trimmed.length < 10) return false;

  if (isNonMusicTitleCollisionFact(trimmed, title, artist)) return true;
  if (isPlaceNameTitleCollision(trimmed, title, artist)) return true;
  if (factMentionsOtherTrackTitle(trimmed, title)) return true;
  if (isAlienSongOriginFact(trimmed, title)) return true;
  if (isArtistCareerBioWithoutTrack(trimmed, title)) return true;

  if (factMentionsTitle(trimmed, title)) return false;

  const trackPool = options.trackPoolFacts ?? [];
  const hasStrongTrackFact = trackPool.some(
    (f) => f.trim().length >= 35 && factMentionsTitle(f, title),
  );

  if (hasStrongTrackFact && !hasAnchoredTrackContext(trimmed, title)) {
    return true;
  }

  if (trackPool.length === 0 && !hasAnchoredTrackContext(trimmed, title)) {
    if (CATALOG_METADATA_PATTERNS.some((p) => p.test(trimmed))) return true;
    if (isArtistCareerBioWithoutTrack(trimmed, title)) return true;
  }

  return false;
}

export function explainTrackAnchorRejection(
  fact: string,
  artist: string,
  title: string,
  options: TrackAnchorOptions = {},
): string | null {
  if (!rejectSeedForTrackStory(fact, artist, title, options)) return null;
  if (isAlienSongOriginFact(fact, title)) return 'alien-song-origin';
  if (isPlaceNameTitleCollision(fact, title, artist)) return 'place-title-collision';
  if (isArtistCareerBioWithoutTrack(fact, title)) return 'artist-career-bio';
  if (isNonMusicTitleCollisionFact(fact, title, artist)) return 'common-word-collision';
  if (factMentionsOtherTrackTitle(fact, title)) return 'other-track-title';
  return 'unanchored-to-track';
}
