/**
 * Quote attribution grounding — scalable, no per-artist blocklists.
 * Rejects seeds where "X said …" cannot be tied to the credited artist roster
 * from the same fetch corpus; rejects scripts that swap the speaker.
 */
import { collaboratorNames, primaryArtistName } from './artist-primary.js';
import { entityMatchesArtist, isCriticAttribution } from './fact-relevance.js';

function isMediaOutletSpeaker(speaker: string, fact: string): boolean {
  if (isCriticAttribution(fact, speaker)) {
    const idx = fact.indexOf(speaker);
    const after = fact.slice(idx + speaker.length, idx + speaker.length + 24);
    if (/^\s+(?:review|article|editorial|interview|magazine|wrote an|published)/i.test(after)) {
      return true;
    }
  }
  return false;
}

function normToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}]/gu, '')
    .trim();
}

const QUOTE_SPEAKER_EN =
  /^([A-Z][a-z]{2,24}(?:\s+[A-Z][a-z]{2,24})?)\s+(?:said|told|explained|admitted|revealed|claimed|wrote|noted|recalled|described|added)\b/i;

const QUOTE_SPEAKER_RU =
  /^([А-ЯЁ][а-яё]{2,24}(?:\s+[А-ЯЁ][а-яё]{2,24})?)\s+(?:сказал|сказала|признал|призналась|рассказал|рассказала|отметил|отметила|заявил|заявила|поделился|поделилась)\b/iu;

const QUOTE_SPEAKER_EN_SCRIPT =
  /([A-Z][a-z]{2,24}(?:\s+[A-Z][a-z]{2,24})?)\s+(?:said|told|explained|admitted|revealed|claimed|wrote|noted|recalled|described|added)\b/gi;

const SCRIPT_SPEAKER_RU =
  /([А-ЯЁ][а-яё]{2,24}(?:\s+[А-ЯЁ][а-яё]{2,24})?)\s+(?:признавался|признавалась|сказал|сказала|рассказывал|рассказывала|вспоминал|вспоминала|отмечал|отмечала|заявлял|заявляла)/giu;

const MEMBER_ROLE_EN =
  /\b(?:guitarist|bassist|drummer|vocalist|frontman|singer|keyboardist|founder|co[- ]?founder|member|producer)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi;

const MEMBER_ROLE_RU =
  /(?:гитарист|басист|барабанщик|вокалист|основатель|участник|участница|музыкант|продюсер)\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?)/giu;

const COMMON_QUOTE_VERBS =
  /\b(?:said|told|explained|admitted|revealed|claimed|wrote|noted|recalled|described|сказал|признал|рассказал|отметил|заявил)\b/i;

export function extractQuoteSpeakerFromFact(fact: string): string | null {
  const trimmed = fact.trim();
  const en = trimmed.match(QUOTE_SPEAKER_EN);
  if (en?.[1]) return en[1].trim();
  const ru = trimmed.match(QUOTE_SPEAKER_RU);
  if (ru?.[1]) return ru[1].trim();
  return null;
}

function addNameTokens(target: Set<string>, name: string): void {
  const parts = name.trim().split(/\s+/).filter((p) => p.length >= 3);
  for (const part of parts) target.add(normToken(part));
  if (parts.length >= 2) target.add(normToken(parts[parts.length - 1]!));
}

/** Roster surnames/tokens from artist credits + member roles named in the same fetch corpus. */
export function collectArtistRosterTokens(artist: string, corpus: string[]): Set<string> {
  const tokens = new Set<string>();
  for (const name of [artist, ...collaboratorNames(artist)]) {
    addNameTokens(tokens, primaryArtistName(name));
    addNameTokens(tokens, name);
  }

  const blob = corpus.join('\n');
  for (const re of [MEMBER_ROLE_EN, MEMBER_ROLE_RU]) {
    for (const match of blob.matchAll(re)) {
      if (match[1]) addNameTokens(tokens, match[1]);
    }
  }
  return tokens;
}

function speakerMatchesRoster(speaker: string, roster: Set<string>, artist: string): boolean {
  if (entityMatchesArtist(speaker, artist, '')) return true;
  const speakerParts = speaker.split(/\s+/).map(normToken).filter((p) => p.length >= 3);
  if (speakerParts.length === 0) return false;
  for (const part of speakerParts) {
    if (roster.has(part)) return true;
  }
  const surname = speakerParts[speakerParts.length - 1]!;
  if (roster.has(surname)) return true;
  return false;
}

/**
 * Seed quotes "Barnes said …" but corpus only names Hayes/Been — unverified attribution.
 * Requires at least 2 roster tokens from corpus before rejecting (avoid false positives on sparse fetch).
 */
export function isUnverifiedQuoteAttributionSeed(
  fact: string,
  artist: string,
  corpus: string[] = [],
): boolean {
  if (!COMMON_QUOTE_VERBS.test(fact)) return false;
  const speaker = extractQuoteSpeakerFromFact(fact);
  if (!speaker) return false;
  if (isMediaOutletSpeaker(speaker, fact)) return false;

  const roster = collectArtistRosterTokens(artist, corpus);
  if (roster.size < 2) return false;
  return !speakerMatchesRoster(speaker, roster, artist);
}

function extractScriptSpeakers(script: string): string[] {
  const out: string[] = [];
  for (const match of script.matchAll(SCRIPT_SPEAKER_RU)) {
    if (match[1]) out.push(match[1].trim());
  }
  for (const match of script.matchAll(QUOTE_SPEAKER_EN_SCRIPT)) {
    if (match[1]) out.push(match[1].trim());
  }
  return out;
}

function speakersEquivalent(a: string, b: string): boolean {
  const aParts = a.split(/\s+/).map(normToken).filter(Boolean);
  const bParts = b.split(/\s+/).map(normToken).filter(Boolean);
  if (aParts.length === 0 || bParts.length === 0) return false;
  const aLast = aParts[aParts.length - 1]!;
  const bLast = bParts[bParts.length - 1]!;
  if (aLast === bLast) return true;
  return aParts.some((p) => bParts.includes(p));
}

/** Script swapped seed speaker (Barnes → Peter Hayes). */
export function findQuoteSpeakerDrift(script: string, seedFact: string): string | null {
  const seedSpeaker = extractQuoteSpeakerFromFact(seedFact);
  if (!seedSpeaker) return null;
  for (const scriptSpeaker of extractScriptSpeakers(script)) {
    if (!speakersEquivalent(scriptSpeaker, seedSpeaker)) {
      return `quote speaker drift: seed names "${seedSpeaker}" but script uses "${scriptSpeaker}"`;
    }
  }
  return null;
}
