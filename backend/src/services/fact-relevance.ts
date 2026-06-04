/** Reject Wikipedia/DDG sentences about the wrong act — no hardcoded artist blocklists. */

import { collaboratorNames } from './artist-primary.js';

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

  return dedupe(entities);
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

/** Story validation: ignore song titles in «quotes» when checking for wrong artists. */
export function storyNamesForeignArtist(
  script: string,
  artist: string,
  title: string,
  referenceFacts: string[] = [],
): boolean {
  return factNamesForeignEntity(
    withoutQuotedSpans(script),
    artist,
    title,
    referenceFacts.join('\n'),
  );
}

/** Another act is named in the fact — not the requested artist/title. */
export function factNamesForeignEntity(
  fact: string,
  artist: string,
  title: string,
  allowedContext = '',
): boolean {
  const artistNorm = normalize(artist);
  const titleNorm = normalize(title.replace(/\s*\([^)]*\)\s*/g, ' '));
  const norm = normalize(fact);
  const allowedNorm = normalize(allowedContext);

  for (const entity of extractNamedEntities(fact)) {
    if (isNonActEntity(entity)) continue;
    if (isCriticAttribution(fact, entity)) continue;
    if (entityMatchesArtist(entity, artist, title)) continue;

    const eNorm = normalize(entity);
    if (eNorm.length < 3) continue;
    if (allowedNorm.length >= 8 && allowedNorm.includes(eNorm)) continue;

    if (eNorm.includes('-') || eNorm.split(' ').length >= 2) return true;

    const aTok = artistTokens(artist);
    if (aTok.length >= 2 && !aTok.includes(eNorm) && eNorm.length >= 4) return true;
  }

  // Normalized multi-word phrases: «jay z» when artist is «will jay».
  const words = norm.split(' ').filter(Boolean);
  const titleNormFull = titleNorm;
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    if (phrase.length < 5) continue;
    if (artistNorm.includes(phrase) || titleNormFull.includes(phrase)) continue;
    if (entityMatchesArtist(phrase, artist, title)) continue;
    const aTok = artistTokens(artist);
    if (aTok.length >= 2 && aTok.includes(words[i]) && !aTok.includes(words[i + 1])) {
      return true;
    }
  }

  return false;
}

export function factMentionsArtist(fact: string, artist: string): boolean {
  const artistNorm = normalize(artist);
  const factNorm = normalize(fact);
  if (artistNorm.length >= 3 && factNorm.includes(artistNorm)) return true;

  const tokens = artistTokens(artist);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return factNorm.includes(tokens[0]);

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
    if (mentionsArtist) return true;
    // Строки со страницы группы (бан Wounded Knee и т.п.) не повторяют имя в каждом предложении.
    if (!factNamesForeignEntity(trimmed, artist, title, artist)) return true;
    // Web-сниппеты: Vegas / discrimination / heritage без слова «Redbone».
    if (
      /\b(?:Vegas|Vasquez|discrimination|heritage|Native American|appeal to (?:a )?white)\b/i.test(trimmed)
    ) {
      return true;
    }
    return false;
  }
  if (mentionsTitle || mentionsArtist) return true;
  // Строки со страницы песни («The song was… Hail», «The single cut…») без повторного названия.
  if (/^(?:The song|It|This track|This single|The single cut|The lyrics)\b/i.test(trimmed)) {
    return true;
  }
  if (/\b(?:single cut is significantly shorter|promo track under the name)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}
