/** Reject Wikipedia/DDG sentences about the wrong act — no hardcoded artist blocklists. */

import { collaboratorNames } from './artist-primary.js';
import { isNonMusicProfessionText } from './wikipedia-music.js';

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

/** Слова-существительные/приветствия, совпадающие с именем артиста — не путать с группой. */
const AMBIGUOUS_COMMON_WORD_ARTISTS = new Set(
  ['привет', 'плохо', 'любовь', 'скорpioн', 'hello', 'bad', 'good', 'love', 'pain'].map(
    normalize,
  ),
);

export function isAmbiguousCommonWordArtist(artist: string): boolean {
  return AMBIGUOUS_COMMON_WORD_ARTISTS.has(normalize(artist));
}

/** Для «Привет» / «Плохо» — факт должен явно называть группу, а не слово в тексте. */
export function factMentionsArtistAsEntity(fact: string, artist: string): boolean {
  if (!isAmbiguousCommonWordArtist(artist)) return factMentionsArtist(fact, artist);
  const escaped = artist.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    new RegExp(`(?:группа|артист|band|artist|коллектив|duo|псевдоним|проект)\\s+[«"']?${escaped}`, 'i').test(
      fact,
    ) ||
    new RegExp(`[«"']${escaped}[«"']`, 'i').test(fact) ||
    new RegExp(`\\b${escaped}\\s+(?:band|group|artist|коллектив|duo)\\b`, 'i').test(fact)
  );
}

/** Outlets / labels — not musical acts. */
const NON_ACT_PHRASES = new Set(
  [
    'popmatters',
    'pop matters',
    'billboard',
    'pitchfork',
    'rolling stone',
    'spin magazine',
    'nme',
    'variety',
    'allmusic',
    'discogs',
    'musicbrainz',
    'wikipedia',
    'american gangster',
    'cash box',
    'warner music',
    'sony music',
    'universal music',
    'warner latina',
    'warner argentina',
  ].map(normalize),
);

const CRITIC_AFTER_NAME =
  /(?:'s|\s+(?:is|was|are|were|has|had|from|of|for|at|in)\b|\s+(?:считает|писал|назвал|отметил|reviewed|wrote|said|believes|praises|notes))\b/i;

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

function isNonActEntity(name: string): boolean {
  const n = normalize(name);
  if (NON_ACT_PHRASES.has(n)) return true;
  for (const phrase of NON_ACT_PHRASES) {
    if (n.includes(phrase) || phrase.includes(n)) return true;
  }
  return false;
}

function isCriticAttribution(fact: string, entity: string): boolean {
  const idx = fact.indexOf(entity);
  if (idx < 0) return false;
  const after = fact.slice(idx + entity.length, idx + entity.length + 80);
  return CRITIC_AFTER_NAME.test(after);
}

/** Named entities that could be musical acts (Latin + Cyrillic). */
function extractNamedEntities(fact: string): string[] {
  const entities: string[] = [];

  for (const match of fact.matchAll(/\b([A-Z][a-z]+(?:-[A-Z][a-z]+)+)\b/g)) {
    entities.push(match[1]);
  }
  for (const match of fact.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g)) {
    entities.push(match[1]);
  }
  for (const match of fact.matchAll(/\b([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+){0,3})'s\b/g)) {
    entities.push(match[1]);
  }
  for (const match of fact.matchAll(/\b([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){0,2})\b/g)) {
    entities.push(match[1]);
  }
  const SKIP_SINGLE = new Set(
    [
      'the',
      'this',
      'that',
      'when',
      'where',
      'like',
      'with',
      'from',
      'they',
      'their',
      'there',
      'these',
      'those',
      'song',
      'album',
      'band',
      'group',
      'single',
      'radio',
      'video',
      'music',
      'reddit',
      'wikipedia',
    ].map(normalize),
  );
  for (const match of fact.matchAll(/\b([A-Z][a-z]{2,18})\b/g)) {
    const name = match[1];
    if (SKIP_SINGLE.has(normalize(name))) continue;
    entities.push(name);
  }

  return dedupe(entities);
}

/** Мусор из HTML-поиска: списки «1. …», чужие хиты без связи с артистом. */
const WEB_LISTICLE_JUNK =
  /^\s*\d+\.\s*["«]|©Reddit|©\w{2,}\b|When\s+[A-Z][a-z]+\s+mixed\b/i;

export function isWebListicleJunk(fact: string): boolean {
  return WEB_LISTICLE_JUNK.test(fact.trim());
}

/** Тот же заголовок, но про фильм/сериал — не про песню. */
export function isWrongTitleMediumCollision(fact: string, title: string): boolean {
  const titleNorm = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  if (titleNorm.length < 4) return false;
  if (!normalize(fact).includes(titleNorm)) return false;
  return /(?:премьер\w*\s+фильм|фильм\s*«|военной\s+драм|картин\w*\s+рассказывает|в\s+кинотеатр|Netflix|сериал)/i.test(fact);
}

/**
 * True when `entity` is the requested artist/title — not a partial token overlap
 * (e.g. Will Jay ≠ Jay-Z).
 */
function entityMatchesSingle(entity: string, artist: string, title: string): boolean {
  const e = normalize(entity);
  const a = normalize(artist);
  const t = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  if (e.length < 2) return false;

  if (e === a || (a.length >= 4 && a.includes(e) && e.split(' ').length >= 2)) return true;
  if (t.length >= 4 && (e === t || e.includes(t) || t.includes(e))) return true;

  const eTok = e.split(' ').filter((part) => part.length >= 2);
  const aTok = artistTokens(artist);
  if (eTok.length === 0 || aTok.length === 0) return false;

  if (
    eTok.length === aTok.length &&
    eTok.every((token) => aTok.includes(token)) &&
    aTok.every((token) => eTok.includes(token))
  ) {
    return true;
  }

  const shared = eTok.filter((token) => aTok.includes(token));
  if (shared.length === 0) return false;

  // Partial overlap only → different acts (Jay-Z vs Will Jay).
  if (shared.length < Math.min(eTok.length, aTok.length)) return false;

  return eTok.every((token) => aTok.includes(token));
}

export function entityMatchesArtist(entity: string, artist: string, title: string): boolean {
  if (entityMatchesSingle(entity, artist, title)) return true;
  for (const collab of collaboratorNames(artist)) {
    if (collab !== artist && entityMatchesSingle(entity, collab, title)) return true;
  }
  return false;
}

/** Quoted spans are usually track/album titles, not other artists. */
function withoutQuotedSpans(text: string): string {
  return text
    .replace(/[«"][^»"]+[»"]/g, ' ')
    .replace(/«[^»]+»/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Tokens/names from reference facts — band members, places, composers, etc. */
function referenceFactTokens(referenceFacts: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const fact of referenceFacts) {
    for (const entity of extractNamedEntities(fact)) {
      for (const part of normalize(entity).split(' ')) {
        if (part.length >= 3) tokens.add(part);
      }
    }
    for (const part of normalize(fact).split(' ')) {
      if (part.length >= 4) tokens.add(part);
    }
  }
  return tokens;
}

export const COVER_CONTEXT_RE =
  /\b(?:author|wrote|written by|composed|composer|создал|написал|автор|original(?:ly)?|кавер|cover|перепев|верси(?:я|и)|записал)\b/i;

/** Original artist names allowed in story only when facts explicitly mention cover/authorship. */
export function allowedCoverEntities(referenceFacts: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const fact of referenceFacts) {
    if (!COVER_CONTEXT_RE.test(fact)) continue;
    for (const entity of extractNamedEntities(fact)) {
      const norm = normalize(entity);
      if (!norm || norm.length < 3) continue;
      allowed.add(norm);
      for (const part of norm.split(' ')) {
        if (part.length >= 4) allowed.add(part);
      }
    }
  }
  return allowed;
}

function entityAllowedAsCover(entity: string, coverAllowed: Set<string>): boolean {
  const norm = normalize(entity);
  if (coverAllowed.has(norm)) return true;
  const parts = norm.split(' ').filter((p) => p.length >= 3);
  return parts.length >= 2 && parts.every((p) => coverAllowed.has(p));
}

/** Story validation: ignore song titles in «quotes» when checking for wrong artists. */
export function storyNamesForeignArtist(
  script: string,
  artist: string,
  title: string,
  referenceFacts: string[] = [],
): boolean {
  const cleaned = withoutQuotedSpans(script);
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const allowed = referenceFacts.join('\n');
  const seedTokens = referenceFactTokens(referenceFacts);
  const coverAllowed = allowedCoverEntities(referenceFacts);

  // Grounded story already names the artist — only reject clear other *bands* (2+ words), not member surnames.
  if (factMentionsArtist(cleaned, artist)) {
    for (const entity of extractNamedEntities(cleaned)) {
      if (isContextEntity(entity)) continue;
      if (isCriticAttribution(cleaned, entity)) continue;
      if (entityMatchesArtist(entity, artist, cleanTitle)) continue;
      if (entityAllowedAsCover(entity, coverAllowed)) continue;
      const eNorm = normalize(entity);
      if (eNorm.length < 3) continue;
      if (seedTokens.has(eNorm)) continue;
      if (allowed.length >= 8 && normalize(allowed).includes(eNorm)) continue;
      if (eNorm.split(' ').length >= 2) return true;
    }
    return false;
  }

  return factNamesForeignEntity(cleaned, artist, cleanTitle, allowed);
}

export type RelevanceMode = 'strict' | 'indie';

/** Labels, platforms, festivals — not competing musical acts. */
const CONTEXT_ENTITY_PHRASES = new Set(
  [
    ...NON_ACT_PHRASES,
    'sacred bones',
    'sacred bones records',
    'tiktok',
    'spotify',
    'youtube',
    'bandcamp',
    'glastonbury',
    'glastonbury festival',
    'woodstock',
    'przystanek woodstock',
    'michael eavis',
    'other stage',
    'chrysta bell',
    'escape from tarkov',
    'foo fighters',
    'eagles of death metal',
    'minsk arena',
    'harakiri diat',
    'viral 50',
    'doomer',
    'north america',
    'belarus',
    'minsk',
    'grammy',
    'grammy awards',
    'allmusic',
    'adrianne lenker',
    'buck meek',
  ].map(normalize),
);

function isContextEntity(name: string): boolean {
  const n = normalize(name);
  if (CONTEXT_ENTITY_PHRASES.has(n)) return true;
  for (const phrase of CONTEXT_ENTITY_PHRASES) {
    if (n.includes(phrase) || phrase.includes(n)) return true;
  }
  return isNonActEntity(name);
}

function isSameBandHistoricalName(fact: string): boolean {
  return /\b(?:their name to|formerly known as|renamed to|changed their name to|originally called|previously known as)\b/i.test(
    fact,
  );
}

const INDIE_BAND_CONTEXT =
  /^(?:The band|They |Their |Founding member|Members |Many of the band|On \d+|In \d+|During |Over time|As well as|We never expected|The label|Later changed|In January|In \w+ \d{4}|Cash Box|Founding member|The song|The track|This track)/i;

/** Another act is named in the fact — not the requested artist/title. */
export function factNamesForeignEntity(
  fact: string,
  artist: string,
  title: string,
  allowedContext = '',
  mode: RelevanceMode = 'strict',
): boolean {
  if (factMentionsArtist(fact, artist) && isBandBiographyFact(fact)) {
    return false;
  }

  if (mode === 'indie') {
    if (factMentionsArtist(fact, artist)) return false;
    if (isSameBandHistoricalName(fact)) return false;
  }

  const artistNorm = normalize(artist);
  const titleNorm = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  const norm = normalize(fact);
  const allowedNorm = normalize(allowedContext);

  for (const entity of extractNamedEntities(fact)) {
    if (isContextEntity(entity)) continue;
    if (isCriticAttribution(fact, entity)) continue;
    if (entityMatchesArtist(entity, artist, title)) continue;

    const eNorm = normalize(entity);
    if (eNorm.length < 3) continue;
    if (allowedNorm.length >= 8 && allowedNorm.includes(eNorm)) continue;

    if (mode === 'indie' && eNorm.split(' ').length === 1 && eNorm.length < 8) continue;

    if (eNorm.includes('-') || eNorm.split(' ').length >= 2) return true;

    const aTok = artistTokens(artist);
    if (aTok.length >= 2 && !aTok.includes(eNorm) && eNorm.length >= 4) return true;
  }

  const words = norm.split(' ').filter(Boolean);
  const titleNormFull = titleNorm;
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (phrase.length < 5) continue;
    if (artistNorm.includes(phrase) || titleNormFull.includes(phrase)) continue;
    if (entityMatchesArtist(phrase, artist, title)) continue;
    const aTok = artistTokens(artist);
    if (aTok.length >= 2 && aTok.includes(words[i]) && !aTok.includes(words[i + 1])) {
      if (mode === 'indie' && isContextEntity(phrase)) continue;
      return true;
    }
  }

  return false;
}

const GENERIC_DISAMBIGUATION =
  /\b(?:guild system|journeyman|master craftsman|term was generally restricted|disambiguation page|may refer to)\b/i;

/** Wikipedia band page — member names and places are expected, not «foreign acts». */
function isBandBiographyFact(fact: string): boolean {
  return (
    /\b(?:rock band|pop band|hip hop|rap group|musical group|boy band|girl group|группа|рок группа)\b/i.test(
      fact,
    ) ||
    /\b(?:band members?|formed in|replaced by|original (?:band )?members|line[- ]up|co[- ]founder|vocalist|bassist|guitarist|drummer)\b/i.test(
      fact,
    )
  );
}

function isGenericDisambiguationFact(fact: string, artist: string): boolean {
  return GENERIC_DISAMBIGUATION.test(fact) && !factMentionsArtist(fact, artist);
}

function artistSurnameInFact(fact: string, artist: string): boolean {
  const parts = normalize(artist).split(' ').filter((w) => w.length >= 5);
  if (parts.length === 0) return false;
  const factNorm = normalize(fact);
  return parts.some((token) => factNorm.includes(token));
}

export function factMentionsArtist(fact: string, artist: string): boolean {
  const artistNorm = normalize(artist);
  const factNorm = normalize(fact);
  if (artistNorm.length >= 3 && factNorm.includes(artistNorm)) return true;

  const tokens = artistTokens(artist);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return factNorm.includes(tokens[0]);
  if (artistSurnameInFact(fact, artist)) return true;

  const words = factNorm.split(' ');
  for (let i = 0; i < words.length; i++) {
    let matched = 0;
    for (let j = i; j < words.length && j < i + 10; j++) {
      if (words[j] === tokens[matched]) {
        matched++;
        if (matched === tokens.length) return true;
      }
    }
  }
  return false;
}

export function factMentionsTitle(fact: string, title: string): boolean {
  const clean = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const titleNorm = normalize(clean);
  if (titleNorm.length < 2) return false;
  const factNorm = normalize(fact);
  if (titleNorm.length >= 4 && factNorm.includes(titleNorm)) return true;
  if (titleNorm.length < 4) {
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`[«""']\\s*${escaped}\\s*[»""']`, 'i').test(fact)) return true;
    if (new RegExp(`\\b(?:song|track|single|titled?)\\s+[«""']?${escaped}[«""']?`, 'i').test(fact)) return true;
  }
  return false;
}

/** Другая песня того же артиста в кавычках — не семя для запрошенного трека. */
export function factMentionsOtherTrackTitle(fact: string, title: string): boolean {
  if (factMentionsTitle(fact, title)) return false;

  const titleNorm = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  const factNorm = normalize(fact);

  const otherSongPhrases = [
    'wounded knee',
    'we are the champions',
    'we will rock you',
    'seven seas of rhye',
    'another one bites the dust',
    'группа крови',
    'кукушка',
    'звезда по имени солнце',
  ];
  for (const phrase of otherSongPhrases) {
    if (phrase === titleNorm || titleNorm.includes(phrase) || phrase.includes(titleNorm)) continue;
    if (factNorm.includes(phrase)) return true;
  }

  for (const match of fact.matchAll(/[«"]([^»"]{4,80})[»"]/g)) {
    const quoted = normalize(match[1]);
    if (quoted.length < 4) continue;
    if (quoted === titleNorm || titleNorm.includes(quoted) || quoted.includes(titleNorm)) continue;
    if (/\b(?:album|альбом)\b/i.test(match[1]) || /\(\d{4}\)/.test(match[1])) continue;
    if (/^(?:the|a|an)\s+/i.test(match[1])) continue;
    if (/\b(?:folk|indie|rock|pop|metal|jazz|soul|punk|style|songwriting|alternative)\b/i.test(match[1])) continue;
    if (match[1].trim().split(/\s+/).length > 5) continue;
    return true;
  }
  return false;
}

export function isAlbumScopeFact(fact: string, title: string): boolean {
  if (factMentionsTitle(fact, title)) return false;
  if (/^(?:The song|This song|It was|The single|This track)\b/i.test(fact.trim())) return false;
  if (/\b(?:promo track under the name|originally released as a promo|single cut is significantly shorter)\b/i.test(fact)) {
    return false;
  }
  return (
    /\b(?:from the album|on the album|on their (?:debut|self-titled|third|fourth|fifth|sixth) album|appears on the album|featured on their)\b/i.test(fact) ||
    /(?:альбом[еау«»]|из\s+альбома|на\s+альбом)/i.test(fact)
  );
}

/** Fact must belong to this artist/title — not a neighbour sentence from the wrong wiki page. */
export function factAppliesToRequest(
  fact: string,
  artist: string,
  title: string,
  scope: 'artist' | 'track',
  mode: RelevanceMode = 'strict',
): boolean {
  const trimmed = fact.trim();
  if (trimmed.length < 35) return false;
  if (isNonMusicProfessionText(trimmed)) return false;
  if (isAmbiguousCommonWordArtist(artist) && !factMentionsArtistAsEntity(trimmed, artist)) return false;
  if (isWebListicleJunk(trimmed)) return false;
  if (isGenericDisambiguationFact(trimmed, artist)) return false;
  if (isWrongTitleMediumCollision(trimmed, title)) return false;
  if (factMentionsOtherTrackTitle(trimmed, title)) return false;
  if (factNamesForeignEntity(trimmed, artist, title, '', mode)) return false;

  const mentionsArtist = factMentionsArtist(trimmed, artist);
  const mentionsTitle = factMentionsTitle(trimmed, title);

  if (scope === 'track') {
    // Title-only snippets describe the composition (covers, critic quotes) — not this performer.
    if (mentionsTitle && !mentionsArtist) return false;
    // Unrelated events (awards lists, year-in-review) without artist or title.
    if (!mentionsArtist && !mentionsTitle) return false;
  }

  if (scope === 'artist') {
    if (mentionsArtist || mentionsTitle) return true;
    const bandPageContext =
      /^(?:The band|They |Their |Members |He |She |His |Her |It was|The group|According to|Born |Known professionally)\b/i.test(trimmed) ||
      /\b(?:was a |is a |known professionally as|stage name is|credited as the|raised as a)\b/i.test(trimmed) ||
      /\b(?:Wounded Knee|banned by several radio|withheld from release|Native American|heritage|Vasquez|Vegas)\b/i.test(trimmed) ||
      /(?:группа|песн|альбом|запрет|цензур|арми|Цой|Тсо[йи])/i.test(trimmed);
    if (bandPageContext && !factNamesForeignEntity(trimmed, artist, title, artist, mode)) return true;
    if (mode === 'indie' && INDIE_BAND_CONTEXT.test(trimmed)) return true;
    return false;
  }
  if (mentionsTitle) return true;
  if (mentionsArtist && !mentionsTitle) {
    // Band biography without the song title — artist pool, not track (e.g. "According to … band wanted the name").
    if (
      /^(?:According to|The band wanted|the band wanted|originally called|formerly known|named after|called themselves|Members |He formed|She formed)\b/i.test(
        trimmed,
      )
    ) {
      return false;
    }
  }
  if (mentionsArtist) return true;
  if (/^(?:The song|The video|The single|It|This track|This single|The single cut|The lyrics|Recording|Mercury|He |They |Upon |During |After |When |While |In an interview)\b/i.test(trimmed)) {
    return true;
  }
  if (/\b(?:music video|operatic section|studio session|composed the|wrote the|recorded at|took three weeks|no chorus|gained popularity|viral|tiktok|signed with|influenced by)\b/i.test(trimmed)) {
    return true;
  }
  if (/\b(?:single cut is significantly shorter|promo track under the name)\b/i.test(trimmed)) {
    return true;
  }
  if (mode === 'indie' && INDIE_BAND_CONTEXT.test(trimmed)) return true;
  return false;
}

/** Split merged pool into track/artist with optional indie relaxation. */
export function assignFactsToScopes(
  facts: string[],
  artist: string,
  title: string,
  mode: RelevanceMode = 'strict',
): { trackFacts: string[]; artistFacts: string[] } {
  const trackFacts: string[] = [];
  const artistFacts: string[] = [];
  const seen = new Set<string>();

  for (const fact of facts) {
    const key = normalize(fact);
    if (seen.has(key)) continue;

    const trackOk = factAppliesToRequest(fact, artist, title, 'track', mode);
    const artistOk = factAppliesToRequest(fact, artist, title, 'artist', mode);
    const mentionsTitle = factMentionsTitle(fact, title);

    if (trackOk || (mode === 'indie' && mentionsTitle && artistOk)) {
      seen.add(key);
      trackFacts.push(fact);
    } else if (artistOk) {
      seen.add(key);
      artistFacts.push(fact);
    }
  }

  return { trackFacts, artistFacts };
}
