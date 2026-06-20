/**
 * Systemic guard: every seed for artist+title must anchor to THAT track.
 * Blocks cross-song wiki bleed, place-name collisions, and career bios on track requests.
 */

import {
  factMentionsArtist,
  factMentionsOtherTrackTitle,
  factMentionsTitle,
  factNamesForeignEntity,
  hasRussianTrackContextSignal,
  hasTrackContextSignal,
  isMisattributedBandTrackFact,
  isNonMusicTitleCollisionFact,
} from './fact-relevance.js';
import {
  adjustedInterestScore,
  isAlbumListingSeed,
  isArtistDisambiguationListSeed,
  isCatalogMetadataSeed,
  isEncyclopediaDefinitionSeed,
} from './reference-fact-quality.js';
import { isArtistBackstoryNarrative } from './web-snippet-accept.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';

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
  /\b(?:pop rock band|rock band|indie rock band)\b.*\boriginated in\b/i,
  /\b(?:up-and-coming|indie rock band)\b.*\bfrom Moscow\b/i,
  /\bknown by the stage name\b/i,
  /\bknown professionally as\b/i,
  /\b(?:was|is)\s+an?\s+(?:American|British|Canadian|Russian|Swedish|German|French|Japanese|Australian|Italian|Spanish|Irish|Scottish|Welsh|Mexican|Brazilian|Norwegian|Danish|Finnish|Dutch|Belgian|Austrian|Swiss|Polish|Ukrainian|Korean|Chinese|Indian)\s+(?:singer|songwriter|actor|musician|rapper|composer|producer)(?:,\s*(?:songwriter|actor|musician|rapper|producer))*\b/i,
  /\bwho performed\s+(?:pop|rock|swing|folk|country|jazz|soul|blues|metal|hip[- ]?hop|r[\s&]b|electronic)\b/i,
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
  /\btold the audience\b/i,
  /\bthere'?s no going back from this point\b/i,
];

/** Lyrical character from another song (Dani in «Dani California», not «Can't Stop»). */
const LYRICAL_CHARACTER_BLEED: Array<{
  name: RegExp;
  unlessTitle: RegExp;
  context: RegExp;
}> = [
  {
    name: /\bDani\b/,
    unlessTitle: /\bdani\b/,
    context: /\b(?:laments?|death of|mourns?|young southern girl|throughout the song|lyricist)\b/i,
  },
];

export function isAlienLyricalCharacterFact(fact: string, title: string): boolean {
  if (factMentionsTitle(fact, title)) return false;
  const titleNorm = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  const trimmed = fact.trim();

  for (const rule of LYRICAL_CHARACTER_BLEED) {
    if (rule.unlessTitle.test(titleNorm)) continue;
    if (rule.name.test(trimmed) && rule.context.test(trimmed)) return true;
  }

  if (/\bthroughout the song\b/i.test(trimmed) && /\b(?:lyricist|laments?|mourns?|describes?)\b/i.test(trimmed)) {
    const nameMatch = trimmed.match(
      /\b(?:laments?|mourns?|death of|about)\s+(?:the\s+)?(?:early\s+)?(?:death\s+of\s+)?([A-Z][a-z]{2,})\b/,
    );
    if (nameMatch) {
      const name = normalize(nameMatch[1]);
      if (name.length >= 3 && !titleNorm.includes(name)) return true;
    }
  }

  return false;
}

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
  if (isArtistBackstoryNarrative(fact)) return false;
  return ARTIST_CAREER_BIO_PATTERNS.some((p) => p.test(fact));
}

/** Band bio sentence names a different single than the requested track. */
export function isOtherNamedSingleBioFact(fact: string, title: string): boolean {
  if (/\bdebut single check\b/i.test(fact)) return true;
  if (/Then the (?:first|second|third|fourth|lead|debut) single \w+/i.test(fact)) return true;
  if (factMentionsTitle(fact, title)) return false;
  const match = fact.match(
    /\b(?:debut|lead|first|second|third)\s+single\s+(?!from\b|off\b|on\b|in\b|of\b|for\b)(?:«|"|'|)([A-Za-zА-Яа-яЁё0-9][\w\s'-]{0,48}?)(?:»|"|'|\s+was|\s+is|\s+from|,|\.|\s+recorded)/iu,
  );
  if (!match?.[1]) return false;
  const named = normalize(match[1]);
  const titleNorm = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  if (named.length < 3 || titleNorm.length < 3) return false;
  if (titleNorm.includes(named) || named.includes(titleNorm)) return false;
  const titleToken = titleNorm.split(' ').filter((p) => p.length >= 4)[0] ?? titleNorm;
  if (titleToken.length >= 4 && (named.includes(titleToken) || titleToken.includes(named))) {
    return false;
  }
  return true;
}

/** Terminal illness / surgery at end of life — not about a specific track unless title is named. */
const ARTIST_LATE_LIFE_HEALTH_PATTERNS: RegExp[] = [
  /\b(?:require|required|needs?|needed)\s+(?:surgery|an operation|chemotherapy|radiation)\b/i,
  /\b(?:rejected|refused|declined)\s+(?:surgery|treatment|chemotherapy|the operation|radiation)\b/i,
  /\bprolong (?:his|her|their) life\b/i,
  /\b(?:was told that (?:he|she|they) would require)\b/i,
  /\b(?:terminal|inoperable)\s+(?:cancer|illness|diagnosis|condition)\b/i,
  /\b(?:lung|brain|pancreatic|liver|prostate)\s+cancer\b/i,
  /\b(?:on (?:his|her|their) deathbed|final days|months to live)\b/i,
  /\b(?:hospice|palliative care)\b/i,
  /\b(?:withdrew from public life).{0,80}(?:cancer|illness|diagnosis)\b/i,
  /(?:отказал\w*|отказ\w*).{0,40}(?:от\s+)?(?:операц|лечен|химиотерап)/i,
  /(?:врач\w*|медик\w*).{0,50}(?:операц|продл\w*\s+жизн)/i,
];

const ARTIST_CAREER_MILESTONE_PATTERNS: RegExp[] = [
  /\b(?:first|only|second|third)\s+(?:Grammy|Oscar|Emmy|Brit|MTV\s+Video\s+Music)\s+(?:nomination|win|award)/i,
  /\b(?:Grammy|Oscar|Emmy)\s+(?:nomination|nominat\w+|award|win)\b/i,
  /\bnominated for (?:Best New Artist|Record of the Year|Album of the Year|Song of the Year)\b/i,
  /\breceived (?:their|his|her) first (?:Grammy|Oscar|Emmy)\b/i,
  /\b(?:Billboard|Hot 100|UK Singles Chart)\b.*\b(?:#1|number one|topped|topping)\b/i,
  /\b(?:billion|million)\s+(?:streams|views|copies)\b/i,
  /\b(?:debuted|peaked|reached)\s+(?:at\s+)?#?\d+\b/i,
];

/** Late-life surgery/illness about the act — not this specific track unless title is named. */
export function isArtistLateLifeHealthFactWithoutTrack(fact: string, title: string): boolean {
  if (!title.trim()) return false;
  if (factMentionsTitle(fact, title)) return false;
  const trimmed = fact.trim();
  if (!ARTIST_LATE_LIFE_HEALTH_PATTERNS.some((p) => p.test(trimmed))) return false;
  if (hasAnchoredTrackContext(trimmed, title)) return false;
  return true;
}

/** Grammy/chart/stream milestone about the act — not this specific track unless title is named. */
export function isArtistCareerMilestoneWithoutTrack(fact: string, title: string): boolean {
  if (!title.trim()) return false;
  if (factMentionsTitle(fact, title)) return false;
  const trimmed = fact.trim();
  if (!ARTIST_CAREER_MILESTONE_PATTERNS.some((p) => p.test(trimmed))) return false;
  if (hasAnchoredTrackContext(trimmed, title)) return false;
  return true;
}

/**
 * Title token appears (e.g. «Pork Soda») but fact is about another act — Primus/Claypool on Glass Animals track.
 */
export function isTitleTokenForeignArtistFact(fact: string, artist: string, title: string): boolean {
  if (!title.trim() || !artist.trim()) return false;
  const trimmed = fact.trim();
  if (!factMentionsTitle(trimmed, title)) return false;
  if (factMentionsArtist(trimmed, artist)) return false;
  if (factNamesForeignEntity(trimmed, artist, title, '', 'strict')) return true;
  if (/\b(?:Claypool|Les Claypool|Primus)\b/i.test(trimmed)) return true;
  return false;
}

/** Fact names the requested track — valid seed even if «first single» boring pattern. */
export function isTrackTitleAnchoredSeed(fact: string, title: string): boolean {
  if (!title.trim()) return false;
  const trimmed = fact.trim();
  if (trimmed.length < 35) return false;
  if (factMentionsTitle(trimmed, title)) return true;
  return hasAnchoredTrackContext(trimmed, title);
}

/** Track pool has a real anchor — not Discogs date/label or disambiguation junk. */
function isStrongTrackPoolAnchor(fact: string, title: string): boolean {
  const trimmed = fact.trim();
  if (trimmed.length < 35 || !factMentionsTitle(trimmed, title)) return false;
  if (/впервые прозвучала на живом выступлении/i.test(trimmed)) return false;
  if (isCatalogMetadataSeed(trimmed) || isAlbumListingSeed(trimmed)) return false;
  if (isMetadataOnlyFallbackFact(trimmed)) return false;
  if (isEncyclopediaDefinitionSeed(trimmed) || isArtistDisambiguationListSeed(trimmed)) {
    return false;
  }
  return hasAnchoredTrackContext(trimmed, title) || adjustedInterestScore(trimmed) >= 6;
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
  if (isAlienLyricalCharacterFact(trimmed, title)) return true;
  if (factMentionsOtherTrackTitle(trimmed, title)) return true;
  if (isAlienSongOriginFact(trimmed, title)) return true;
  if (isArtistCareerBioWithoutTrack(trimmed, title)) return true;
  if (isMisattributedBandTrackFact(trimmed, title)) return true;
  if (isOtherNamedSingleBioFact(trimmed, title)) return true;
  if (isArtistCareerMilestoneWithoutTrack(trimmed, title)) return true;
  if (isArtistLateLifeHealthFactWithoutTrack(trimmed, title)) return true;
  if (isTitleTokenForeignArtistFact(trimmed, artist, title)) return true;

  if (factMentionsTitle(trimmed, title)) return false;

  if (isArtistBackstoryNarrative(trimmed) && factMentionsArtist(trimmed, artist)) return false;

  const trackPool = options.trackPoolFacts ?? [];
  const hasStrongTrackFact = trackPool.some((f) => isStrongTrackPoolAnchor(f, title));

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
  if (isAlienLyricalCharacterFact(fact, title)) return 'alien-lyrical-character';
  if (isPlaceNameTitleCollision(fact, title, artist)) return 'place-title-collision';
  if (isArtistCareerBioWithoutTrack(fact, title)) return 'artist-career-bio';
  if (isArtistCareerMilestoneWithoutTrack(fact, title)) return 'artist-career-milestone';
  if (isArtistLateLifeHealthFactWithoutTrack(fact, title)) return 'artist-late-life-health';
  if (isTitleTokenForeignArtistFact(fact, artist, title)) return 'title-foreign-artist';
  if (isNonMusicTitleCollisionFact(fact, title, artist)) return 'common-word-collision';
  if (factMentionsOtherTrackTitle(fact, title)) return 'other-track-title';
  return 'unanchored-to-track';
}
