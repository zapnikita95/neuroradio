/** Reject Wikipedia/DDG sentences about the wrong act — no hardcoded artist blocklists. */

import { collaboratorNames } from './artist-primary.js';
import { resolveArtistGrammarRu } from './artist-grammar.js';
import { factMentionsArtistOrAlias } from './artist-search-aliases.js';
import { buildTitleMatchVariants, cyrillicToLatin, fuzzyTokenMatch, textMentionsTitle } from './title-transliterate.js';
import { latinPhraseToRussianTts } from './tts-foreign-pronounce.js';
import { isNonMusicProfessionText } from './wikipedia-music.js';
import { rejectSeedForTrackStory } from './fact-track-anchor.js';

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
  ['привет', 'плохо', 'любовь', 'скорпион', 'hello', 'bad', 'good', 'love', 'pain', 'voodoo'].map(
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
    new RegExp(`\\b${escaped}\\s+(?:band|group|artist|коллектив|duo|are|is|were|was)\\b`, 'i').test(fact)
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

export function isCriticAttribution(fact: string, entity: string): boolean {
  const idx = fact.indexOf(entity);
  if (idx < 0) return false;
  const after = fact.slice(idx + entity.length, idx + entity.length + 80);
  return CRITIC_AFTER_NAME.test(after);
}

/** Actor/director/cowriter in a music-video or production context — not a «wrong artist». */
function isCastOrCrewMention(script: string, entity: string): boolean {
  const idx = script.indexOf(entity);
  if (idx < 0) return false;
  const before = script.slice(Math.max(0, idx - 72), idx);
  const after = script.slice(idx + entity.length, idx + entity.length + 48);
  if (
    /(?:актрис(?:ы|а|ой|е)?|акт(?:ё|е)р(?:а|ом|ы|у)?|исполнени(?:и|е)|режисс(?:ё|е)р(?:а|ом|ы)?|directed by|featuring|соавторств(?:е|а)|cowritten|written with|produced by|продюсер(?:а|ом)?|composer|композитор(?:а|ом)?)\s*$/i.test(
      before,
    )
  ) {
    return true;
  }
  if (/^\s*(?:,|и|в|котор|котора|which|who|where)\b/i.test(after)) return true;
  if (/\b(?:music video|клип|видео на трек|mv\b)/i.test(script)) {
    if (/\b(?:геро(?:ин|ей)|рол(?:ь|и)|played|portrayed|stars?)\b/i.test(before)) return true;
  }
  return false;
}

/** Session guitarist / featured guest on the track — not a competing headliner (Beat It → Van Halen). */
function isGuestOrSessionMusicianMention(script: string, entity: string): boolean {
  const lower = script.toLowerCase();
  const entityLower = entity.toLowerCase();
  const idx = lower.indexOf(entityLower);
  if (idx < 0) return false;
  const before = script.slice(Math.max(0, idx - 96), idx);
  const after = script.slice(idx + entity.length, idx + entity.length + 56);
  const ctx = `${before} ${after}`;
  return (
    /(?:гитарист|барабанщик|бас(?:ист)?|клавишник|саксофонист|музыкант|исполнител|session|feat(?:uring|\.|ure)?|featuring|приглас(?:ил(?:и)?|ить)|записал(?:и)?|в\s+од(?:ин|ну)\s+(?:дубль|сессию|take)|solo(?:м|м)?|рифф|guest|collaborat|участ(?:ие|вовал|ник)|специально\s+для|продюсер|producer|cowriter|co-writer|на\s+гитар|гuitar|drums|bass player|played (?:the )?guitar)/i.test(
      ctx,
    ) ||
    /\b(?:Van\s+Halen|Eddie|Эдди)\b/i.test(before)
  );
}

/** Named entities that could be musical acts (Latin + Cyrillic). */
function extractNamedEntities(fact: string): string[] {
  const entities: string[] = [];

  for (const match of fact.matchAll(/\b([A-Z][a-z]+(?:-[A-Z][a-z]+)+)\b/g)) {
    entities.push(match[1]);
  }
  const SKIP_MULTI = new Set(
    [
      'this song',
      'the song',
      'this track',
      'the track',
      'this single',
      'the single',
      'this album',
      'the album',
      'from being',
      'the documentary',
      'the band',
      'one of',
      'four members',
      'the four',
      'the past',
      'happy nation',
      'all that',
    ].map(normalize),
  );
  for (const match of fact.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g)) {
    const phrase = match[1];
    if (SKIP_MULTI.has(normalize(phrase))) continue;
    entities.push(phrase);
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

  const SKIP_ACRONYM = new Set(
    [
      'US',
      'UK',
      'EU',
      'TV',
      'MV',
      'HD',
      'VR',
      'AI',
      'DJ',
      'EP',
      'LP',
      'CD',
      'IT',
      'OR',
      'AN',
      'OF',
      'TO',
      'IN',
      'ON',
      'AT',
      'BY',
      'IS',
      'NO',
      'OK',
      'FIFA',
      'NBA',
      'NFL',
      'BBC',
      'CNN',
      'NME',
    ].map(normalize),
  );
  for (const match of fact.matchAll(/\b([A-Z]{2,5})\b/g)) {
    const name = match[1];
    if (SKIP_ACRONYM.has(normalize(name))) continue;
    entities.push(name);
  }
  for (const match of fact.matchAll(/\b([A-Z][a-z]*[A-Z][A-Za-z]*(?:\s+[A-Z][a-z]+)*)\b/g)) {
    entities.push(match[1]);
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

/** Band/label/place named in seed facts — not a «wrong artist» in the story. */
function entityInReferenceFacts(entity: string, referenceFacts: string[]): boolean {
  const eNorm = normalize(entity);
  if (eNorm.length < 3) return false;
  const blob = normalize(referenceFacts.join(' '));
  if (blob.includes(eNorm)) return true;
  const parts = eNorm.split(' ').filter((p) => p.length >= 3);
  if (parts.length >= 2 && parts.every((p) => blob.includes(p))) return true;
  for (const fact of referenceFacts) {
    for (const refEntity of extractNamedEntities(fact)) {
      if (normalize(refEntity) === eNorm) return true;
    }
  }
  return false;
}

/** Band/album fact without the requested track — must not seed a solo track story. */
export function isMisattributedBandTrackFact(fact: string, title: string): boolean {
  const trimmed = fact.trim();
  if (factMentionsTitle(trimmed, title)) return false;
  if (/\bthe band\b|\bthe group\b|\bthey (?:chose|recorded|decided|flirted)\b/i.test(trimmed)) {
    return true;
  }
  if (/\bnot written by\b|\bsong not written\b|\brecorded a song not written\b/i.test(trimmed)) {
    return true;
  }
  return false;
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
    const seedBlob = normalize(referenceFacts.join(' '));
    const bandContextInSeed = /\bthe band\b|\bband members?\b|\bmatchbox\b|\btheir (?:album|debut|song)\b/i.test(
      seedBlob,
    );
    for (const entity of extractNamedEntities(cleaned)) {
      if (isContextEntity(entity)) continue;
      if (isCriticAttribution(cleaned, entity)) continue;
      if (isCastOrCrewMention(cleaned, entity)) continue;
      if (isGuestOrSessionMusicianMention(cleaned, entity)) continue;
      if (entityMatchesArtist(entity, artist, cleanTitle)) continue;
      if (entityAllowedAsCover(entity, coverAllowed)) continue;
      if (entityInReferenceFacts(entity, referenceFacts)) continue;
      const eNorm = normalize(entity);
      if (bandContextInSeed && eNorm.split(' ').length >= 2) continue;
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
    'eurovision',
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
    if (isLikelyPlaceName(entity)) continue;
    if (isCriticAttribution(fact, entity)) continue;
    if (entityMatchesArtist(entity, artist, title)) continue;
    if (isMusicProductionCredit(fact)) continue;
    if (entityOnlyInParentheses(fact, entity)) continue;

    const eNorm = normalize(entity);
    if (eNorm.length < 3) continue;
    if (allowedNorm.length >= 8 && allowedNorm.includes(eNorm)) continue;

    if (mode === 'indie' && eNorm.split(' ').length === 1 && eNorm.length < 8) continue;

    if (eNorm.includes('-') || eNorm.split(' ').length >= 2) return true;

    const aTok = artistTokens(artist);
    const shortArtist = artistNorm.length <= 3;
    if (shortArtist && eNorm.length >= 4 && !entityMatchesArtist(entity, artist, title)) return true;
    if (aTok.length >= 2 && !aTok.includes(eNorm) && eNorm.length >= 4) return true;
  }

  const words = norm.split(' ').filter(Boolean);
  const titleNormFull = titleNorm;
  for (let i = 0; i < words.length - 1; i++) {
    const w1raw = fact.split(/\s+/)[i] ?? '';
    const w2raw = fact.split(/\s+/)[i + 1] ?? '';
    if (!/^[A-ZÀ-ÖØ-Ý]/.test(w1raw) || !/^[A-ZÀ-ÖØ-Ý]/.test(w2raw)) continue;
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
  const factNorm = normalize(fact);
  const names = [artist, ...collaboratorNames(artist)];
  for (const name of names) {
    const parts = normalize(name)
      .split(' ')
      .filter((w) => w.length >= 4);
    if (parts.some((token) => factNorm.includes(token))) return true;
  }
  return false;
}

/** Common press misspellings (Ray/Reay) and partial name match for web snippets. */
export function factMentionsArtistLoose(fact: string, artist: string): boolean {
  if (factMentionsArtist(fact, artist)) return true;
  const variants: string[] = [artist];
  if (/\breay\b/i.test(artist)) variants.push(artist.replace(/\breay\b/gi, 'Ray'));
  if (/\breay\b/i.test(artist)) variants.push(artist.replace(/\breay\b/gi, 'Reay'));
  for (const variant of variants) {
    if (variant !== artist && factMentionsArtist(fact, variant)) return true;
  }
  const factNorm = normalize(fact);
  for (const token of artistTokens(artist)) {
    if (token.length >= 4 && factNorm.includes(token)) return true;
  }
  return false;
}

export function factMentionsArtist(fact: string, artist: string): boolean {
  const artistNorm = normalize(artist);
  const factNorm = normalize(fact);
  if (artistNorm.length >= 3 && factNorm.includes(artistNorm)) return true;
  if (factMentionsArtistOrAlias(fact, artist)) return true;

  const credits = collaboratorNames(artist);
  if (credits.length > 1) {
    for (const name of credits) {
      const nameNorm = normalize(name);
      if (nameNorm.length >= 2 && factNorm.includes(nameNorm)) return true;
    }
  }

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

/** Press / Wikipedia Cyrillic spellings that differ from TTS transliteration. */
const PRESS_CYRILLIC_TOKEN: Record<string, string[]> = {
  michael: ['майкл', 'микхаил'],
  jackson: ['джексон', 'джакксон'],
  janet: ['джанет'],
  madonna: ['мадонн'],
  prince: ['принс'],
  whitney: ['уитни'],
  houston: ['хьюстон'],
  elvis: ['элвис'],
  presley: ['пресли'],
  chubby: ['чубби'],
  checker: ['чекер'],
  beatles: ['битлз', 'битлс'],
  landis: ['лэндис', 'лендис'],
};

function tokenMentionedInCyrillicScript(scriptNorm: string, token: string): boolean {
  const t = normalize(token);
  if (t.length >= 3 && scriptNorm.includes(t)) return true;

  const ru = normalize(latinPhraseToRussianTts(token));
  if (ru.length >= 3 && scriptNorm.includes(ru)) return true;

  for (const alt of PRESS_CYRILLIC_TOKEN[t] ?? []) {
    if (scriptNorm.includes(normalize(alt))) return true;
  }

  for (const word of scriptNorm.split(' ')) {
    if (word.length >= 3 && fuzzyTokenMatch(word, token)) return true;
    if (word.length >= 4 && fuzzyTokenMatch(cyrillicToLatin(word), token)) return true;
  }
  return false;
}

/** Contemporary / name-sparing scripts: «он/она» when solo artist gender is known. */
function scriptUsesSoloArtistPronoun(script: string, artist: string): boolean {
  const grammar = resolveArtistGrammarRu(artist);
  if (grammar.kind !== 'solo' || !grammar.gender || grammar.gender === 'neutral') {
    return false;
  }
  const SEP = String.raw`(?:^|[\s,.!?«"—-])`;
  const END = String.raw`(?=[\s,.!?»"—-]|$)`;
  if (grammar.gender === 'feminine') {
    return new RegExp(`${SEP}(?:она|её|ее|ей|неё|ней)${END}`, 'iu').test(script);
  }
  return new RegExp(`${SEP}(?:он|его|ему|нем|нём|ним)${END}`, 'iu').test(script);
}

/**
 * Story scripts are Russian — foreign artists often appear as «Майкл Джексон», not «Michael Jackson».
 */
export function storyMentionsPerformingArtist(
  script: string,
  artist: string,
  title = '',
): boolean {
  if (factMentionsArtist(script, artist)) return true;
  if (!/[\u0400-\u04FF]/.test(script)) return false;

  const scriptNorm = normalize(script);
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();

  for (const name of [artist, ...collaboratorNames(artist)]) {
    if (!/[A-Za-zÀ-ÿ]/.test(name)) continue;
    const tokens = artistTokens(name).filter((t) => t.length >= 3);
    if (tokens.length === 0) continue;

    let matched = 0;
    for (const token of tokens) {
      if (tokenMentionedInCyrillicScript(scriptNorm, token)) matched++;
    }

    const need = tokens.length === 1 ? 1 : Math.min(2, tokens.length);
    if (matched >= need) return true;

    if (matched >= 1 && cleanTitle && textMentionsTitle(script, cleanTitle)) return true;
  }

  if (scriptUsesSoloArtistPronoun(script, artist)) return true;

  return false;
}

export function factMentionsTitle(fact: string, title: string): boolean {
  return textMentionsTitle(fact, title);
}

/** Однословные названия вроде «Summer» / «Love» — ложное совпадение с энциклопедией и сезонами. */
const AMBIGUOUS_COMMON_WORD_TITLES = new Set(
  [
    'cliche',
    'cliché',
    'summer',
    'winter',
    'spring',
    'autumn',
    'fall',
    'love',
    'pain',
    'hello',
    'home',
    'time',
    'angel',
    'gold',
    'fire',
    'water',
    'life',
    'death',
    'hope',
    'dream',
    'rain',
    'snow',
    'happy',
    'young',
    'blue',
    'red',
    'star',
    'stars',
    'moon',
    'sun',
    'day',
    'night',
    'alone',
    'stay',
    'run',
    'fly',
    'free',
    'hero',
    'ghost',
    'gravity',
    'paradise',
    'heaven',
    'hell',
    'light',
    'dark',
    'crazy',
    'beautiful',
    'perfect',
    'magic',
    'power',
    'faith',
    'trust',
    'control',
    'work',
    'play',
    'dance',
    'sing',
    'believe',
    'remember',
    'forever',
    'yesterday',
    'tomorrow',
    'today',
    'changes',
    'help',
    'sorry',
    'problem',
    'radio',
    'video',
    'party',
    'money',
    'world',
    'earth',
    'sky',
    'wind',
    'wave',
    'waves',
    'river',
    'ocean',
    'island',
    'city',
    'town',
    'street',
    'road',
    'drive',
    'walk',
    'move',
    'wait',
    'stop',
    'start',
    'break',
    'fix',
    'lost',
    'found',
    'goodbye',
    'good',
    'bad',
    'right',
    'wrong',
    'true',
    'fake',
    'real',
    'mine',
    'yours',
    'ours',
    'theirs',
    'voodoo',
    'hunters',
  ].map(normalize),
);

const NON_MUSIC_TITLE_COLLISION_PATTERNS: RegExp[] = [
  /\b(?:summer|winter|spring|autumn|fall)\s+(?:break|vacation|holiday|solstice|season)\b/i,
  /\b(?:hottest|warmest|coldest|season(?:al)?)\s+(?:season|of the year)\b/i,
  /\bchildren are out of school\b/i,
  /\bfour seasons\b/i,
  /\b(?:is one of the four seasons|is the warmest season|is the hottest season)\b/i,
  /\b(?:зимн|летн|весенн|осенн)(?:ий|яя|ее|ем|ей)\s+(?:период|сезон|отпуск)\b/i,
  /\b(?:сам(?:ый|ая|ое)\s+)?(?:жарк(?:ий|ая|ое)|тёпл(?:ый|ая|ое)|тепл(?:ый|ая|ое)|холодн(?:ый|ая|ое))\s+сезон\b/i,
  /\b(?:haiti|haitian|vodou|voudou|religion|spiritual practice|festival.*\bfans?\b|\b100[,.\s]?000\s+fans?\b)\b/i,
];

export function isAmbiguousCommonWordTitle(title: string): boolean {
  const clean = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const token = normalize(clean).split(' ').filter(Boolean)[0] ?? '';
  if (!token) return false;
  if (/\s/.test(normalize(clean))) return false;
  return AMBIGUOUS_COMMON_WORD_TITLES.has(token);
}

/** Факт про сезон/энциклопедию, а не про трек — совпало одно слово названия. */
export function isNonMusicTitleCollisionFact(fact: string, title: string, artist: string): boolean {
  if (!isAmbiguousCommonWordTitle(title)) return false;
  const titleWord = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  const factNorm = normalize(fact);
  if (!titleWord || !factNorm.includes(titleWord)) return false;

  if (
    hasTrackContextSignal(fact) ||
    hasRussianTrackContextSignal(fact) ||
    /\b(?:song|single|track|released|recorded|chart|spotify|stream|billboard|music video|most[- ]streamed)\b/i.test(
      fact,
    )
  ) {
    return false;
  }

  if (
    factMentionsArtist(fact, artist) &&
    (hasTrackContextSignal(fact) ||
      hasRussianTrackContextSignal(fact) ||
      /\b(?:song|single|track|released|recorded|chart|spotify|stream|billboard|music video|dj|producer)\b/i.test(
        fact,
      ))
  ) {
    return false;
  }

  if (NON_MUSIC_TITLE_COLLISION_PATTERNS.some((pattern) => pattern.test(fact))) return true;

  if (
    !hasTrackContextSignal(fact) &&
    !hasRussianTrackContextSignal(fact) &&
    !factMentionsArtist(fact, artist) &&
    /\b(?:season|school|weather|climate|solstice|hemisphere|months?|vacation|holiday|children|students)\b/i.test(
      fact,
    )
  ) {
    return true;
  }

  return false;
}

/** @deprecated Use buildTitleMatchVariants from title-transliterate.ts */
export function titleMentionVariants(title: string): string[] {
  return buildTitleMatchVariants(title);
}

/** Snippet clearly about the song/video/recording even without repeating artist/title. */
export function hasTrackContextSignal(fact: string): boolean {
  const trimmed = fact.trim();
  if (/^It['']s\b/i.test(trimmed)) return false;
  if (/^It was originally written\b/i.test(trimmed)) return false;
  if (/^It was written by\b/i.test(trimmed) && !/\bthis (?:song|track|single)\b/i.test(trimmed)) {
    return false;
  }
  if (/^(?:It'?s easy to understand|Delve into the|Join professional|Explore songs|Be the first to|The most successful and the best-known is)/i.test(trimmed)) {
    return false;
  }
  if (hasRussianTrackContextSignal(trimmed)) return true;
  return (
    /^(?:The song|The video|The single|The track|This track|This single|This song|This album|The album|The documentary|From being|Additionally)\b/i.test(
      trimmed,
    ) ||
    /^This\s+(?:\w+\s+){0,3}(?:song|love song|track)\b/i.test(trimmed) ||
    /\ba single from (?:their|the|his|her) (?:debut|first|second|third|fourth|fifth|sixth|seventh|\d+(?:st|nd|rd|th)) (?:studio )?album\b/i.test(
      trimmed,
    ) ||
    /^It\s+(?:was|is|became|would|has|had|features|samples|opens|starts|tells|explores|remains)\b/i.test(
      trimmed,
    ) ||
    /\b(?:music video|directed by|controversial nature|five different versions|operatic section|studio session|composed the|wrote the|recorded at|took three weeks|no chorus|gained popularity|viral|tiktok|signed with|influenced by|first single|lead single|first new (?:song|music|single)|announced on youtube|announced a new ep|new lead singer|hidden meaning|origin story|radio banned|refused to play|censored|banned by|intended to|repudiat\w*|members? of the (?:band|group|four)|far[- ]?right|extremist gang|documentary|most[- ]streamed|spotify|apple music|youtube music)\b/i.test(
      trimmed,
    ) ||
    /\b(?:single cut is significantly shorter|promo track under the name)\b/i.test(trimmed)
  );
}

/** Russian fact-hunt / catalog seed — song/album/recording context without English title tokens. */
export function hasRussianTrackContextSignal(fact: string): boolean {
  return /\b(?:песн(?:я|и|ю|ей|не)|трек(?:а|у|ом|е)?|сингл(?:а|ом|е)?|альбом(?:а|е|ом|у)?|клип(?:а|ом|е)?|запис(?:ал|али|ывал|ана|ыва)|написал(?:и)?|композици(?:я|и|ю)|мелоди(?:я|и)|гитар(?:а|е|у)|сингл|american idiot|nevermind|billie joe)\b/i.test(
    fact,
  );
}

function isMusicProductionCredit(fact: string): boolean {
  return /\b(?:directed by|produced by|written by|composed by|video was|filmed by)\b/i.test(fact);
}

/** City/region in artist bio — not a competing musical act. */
function isLikelyPlaceName(entity: string): boolean {
  return (
    /\b(?:St\.?\s|Street|Suffolk|London|England|Scotland|Manchester|Liverpool|Birmingham|California|breeding ground)\b/i.test(
      entity,
    ) || /\b(?:shire|burgh|ford|wich|land)\b/i.test(entity)
  );
}

function entityOnlyInParentheses(fact: string, entity: string): boolean {
  const eNorm = normalize(entity);
  if (eNorm.length < 3) return false;
  const withoutParens = normalize(fact.replace(/\([^)]*\)/g, ' '));
  const full = normalize(fact);
  return full.includes(eNorm) && !withoutParens.includes(eNorm);
}

/** Другая песня того же артиста в кавычках — не семя для запрошенного трека. */
export function factMentionsOtherTrackTitle(fact: string, title: string): boolean {
  const titleNorm = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  const factNorm = normalize(fact);

  const otherSongPhrases = [
    'wounded knee',
    'we are the champions',
    'we will rock you',
    'seven seas of rhye',
    'another one bites the dust',
    'dani california',
    'human nature',
    'группа крови',
    'кукушка',
    'звезда по имени солнце',
  ];
  for (const phrase of otherSongPhrases) {
    if (phrase === titleNorm || titleNorm.includes(phrase) || phrase.includes(titleNorm)) continue;
    if (factNorm.includes(phrase)) return true;
  }

  if (!/\bdani\b/.test(titleNorm) && /\bdani\b/.test(factNorm)) {
    if (
      /\b(?:laments?|death of|mourns?|young southern girl|throughout the song|lyricist)\b/i.test(factNorm)
    ) {
      return true;
    }
  }

  if (
    titleNorm !== 'human nature' &&
    /\b(?:porcaro|steve porcaro)\b/i.test(fact) &&
    /\b(?:originally written|based on a conversation|human nature)\b/i.test(fact)
  ) {
    return true;
  }

  for (const match of fact.matchAll(/[«"]([^»"]{4,80})[»"]/g)) {
    const quoted = normalize(match[1]);
    if (quoted.length < 4) continue;
    if (quoted === titleNorm || titleNorm.includes(quoted) || quoted.includes(titleNorm)) continue;
    if (/\b(?:album|альбом)\b/i.test(match[1]) || /\(\d{4}\)/.test(match[1])) continue;
    if (/^(?:the|a|an)\s+/i.test(match[1])) continue;
    if (/\b(?:folk|indie|rock|pop|metal|jazz|soul|punk|style|songwriting|alternative)\b/i.test(match[1])) continue;
    if (match[1].trim().split(/\s+/).length > 5) continue;
    const before = fact.slice(Math.max(0, (match.index ?? 0) - 55), match.index ?? 0);
    // «Голос Омерики» after «создателя группы» — band name, not another track title.
    if (
      /(?:групп\w*|band|коллектив|проект\w*|ensemble|orchestra|members?\s+of|участник\w*\s+|member\s+of)\s*$/i.test(
        before.trim(),
      )
    ) {
      continue;
    }
    // «Succ My Life» after «альбом» / «релиз» — название альбома, не другой трек.
    if (/(?:альбом|релиз|издани|album|release)\s*[«"]?$/i.test(before.trim())) {
      continue;
    }
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
  if (title && artist && isNonMusicTitleCollisionFact(trimmed, title, artist)) return false;
  if (isAmbiguousCommonWordArtist(artist) && !factMentionsArtistAsEntity(trimmed, artist)) return false;
  if (isWebListicleJunk(trimmed)) return false;
  if (isGenericDisambiguationFact(trimmed, artist)) return false;
  if (isWrongTitleMediumCollision(trimmed, title)) return false;
  if (factMentionsOtherTrackTitle(trimmed, title)) return false;
  if (title && artist && rejectSeedForTrackStory(trimmed, artist, title)) return false;

  const mentionsArtist = factMentionsArtist(trimmed, artist);
  const mentionsTitle = factMentionsTitle(trimmed, title);
  const trackPageTrusted =
    scope === 'track' &&
    (mentionsTitle ||
      hasTrackContextSignal(trimmed) ||
      hasRussianTrackContextSignal(trimmed) ||
      /^[«"']/.test(trimmed));

  if (!trackPageTrusted && factNamesForeignEntity(trimmed, artist, title, '', mode)) return false;

  if (scope === 'track') {
    // Last.fm/Discogs track pages often omit artist name in the sentence — title + context is enough.
    if (mentionsTitle && !mentionsArtist) {
      const titleOnlyOk =
        hasTrackContextSignal(trimmed) ||
        hasRussianTrackContextSignal(trimmed) ||
        /^[«"']/.test(trimmed) ||
        /\b(?:first teased|teased during|confirmed as a track|track title|Clancy World Tour|Tyler stated)\b/i.test(
          trimmed,
        ) ||
        (isAmbiguousCommonWordTitle(title) &&
          /\b(?:spotify|stream|chart|single|song|track|released|billboard|most[- ]streamed)\b/i.test(trimmed));
      if (!titleOnlyOk) return false;
    }
    if (!mentionsArtist && !mentionsTitle) {
      if (hasTrackContextSignal(trimmed)) return true;
      return false;
    }
    if (isMisattributedBandTrackFact(trimmed, title)) return false;
  }

  if (scope === 'artist') {
    if (mentionsArtist || mentionsTitle) return true;
    if (hasTrackContextSignal(trimmed)) return true;
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
