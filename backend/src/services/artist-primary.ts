/**
 * Collab / duo artist tag parsing for harvest, wiki search, relevance.
 *
 * Separators seen in popular-tracks-catalog.json (170k tracks):
 *   & (4055), " and " (1055), comma (728), feat (88), + (73), vs (65), x (64),
 *   ft (22), ; (20), slash (11), /\ (3), Λ (SHM branding), pipe (band names).
 */

const FEAT_SPLIT_RE = /\s+(?:feat\.?|featuring)\s+(?=[\p{L}])/iu;
const VS_SPLIT_RE = /\s+vs\.?\s+(?=[\p{L}])/iu;
const X_DUO_SPLIT_RE = /\s+x\s+(?=[\p{L}])/iu;
const MULTIPLY_SPLIT_RE = /\s+×\s+(?=[\p{L}])/iu;
const LAMBDA_SPLIT_RE = /\s*[Λλ]\s*(?=[\p{L}])/u;
const SLASH_SPLIT_RE = /\s*\/\s*\\?\s*|\s+\/\s+|\s+\\+\s+/u;
const AMPERSAND_SPLIT_RE = /\s*&\s*(?=[\p{L}])/iu;
const PLUS_DUO_SPLIT_RE = /\s+\+\s+(?=[\p{L}])/iu;
const SEMICOLON_SPLIT_RE = /\s*;\s*(?=[\p{L}])/iu;
/** Comma between credited acts — not «Earth, Wind & Fire». */
const COMMA_CREDIT_SPLIT_RE = /,\s+(?=[\p{L}])/iu;
const AND_SPLIT_RE = /\s+and\s+(?!the\b)(?=[\p{L}])/iu;
/** «ft.» as feature credit — not «10 Ft. Ganja Plant». */
const FT_CREDIT_SPLIT_RE = /(?<!\d)\s+ft\.?\s+(?=[\p{L}])/iu;

/** Single-act names that look like duos — never split. */
const PRESERVE_WHOLE_ACT = [
  /^earth,\s*wind\s*&\s*fire$/iu,
  /^tom petty and the heartbreakers$/iu,
  /^florence\s*\+\s*the machine$/iu,
  /^c\+c music factory$/iu,
  /^t\+pazolite$/iu,
  /^\+44$/u,
  /^10\s+ft\.?\s/i,
  /^m\|o\|o\|n$/iu,
  /^blond:ish$/iu,
  /^mike\s*\+\s*the mechanics$/iu,
  /^ich\s*\+\s*ich$/iu,
];

function shouldPreserveWholeAct(artist: string): boolean {
  const t = artist.trim();
  return PRESERVE_WHOLE_ACT.some((re) => re.test(t));
}

/** All split rules in priority order (first match wins per segment). */
const SPLIT_RULES: RegExp[] = [
  FEAT_SPLIT_RE,
  VS_SPLIT_RE,
  LAMBDA_SPLIT_RE,
  SLASH_SPLIT_RE,
  FT_CREDIT_SPLIT_RE,
  X_DUO_SPLIT_RE,
  MULTIPLY_SPLIT_RE,
  PLUS_DUO_SPLIT_RE,
  AMPERSAND_SPLIT_RE,
  SEMICOLON_SPLIT_RE,
  AND_SPLIT_RE,
  COMMA_CREDIT_SPLIT_RE,
];

function splitCollabParts(artist: string): string[] {
  const trimmed = artist.trim();
  if (!trimmed || shouldPreserveWholeAct(trimmed)) return [trimmed];

  let parts = [trimmed];
  for (const rule of SPLIT_RULES) {
    const next: string[] = [];
    for (const part of parts) {
      if (shouldPreserveWholeAct(part)) {
        next.push(part);
        continue;
      }
      const bits = part.split(rule).map((p) => p.trim()).filter(Boolean);
      next.push(...(bits.length > 1 ? bits : [part]));
    }
    parts = next;
  }
  return parts.filter(Boolean);
}

/** Spotify/Apple «Axwell /\ Ingrosso» → canonical «Axwell & Ingrosso» for wiki/API. */
export function normalizeCollabArtistTag(artist: string): string {
  const trimmed = artist.trim();
  if (!trimmed) return artist;
  if (shouldPreserveWholeAct(trimmed)) return trimmed;

  const parts = splitCollabParts(trimmed);
  if (parts.length === 2 && !/&/.test(trimmed)) {
    return `${parts[0]} & ${parts[1]}`;
  }
  if (parts.length >= 2 && /\/|\\|[Λλ]|\svs\.?\s/i.test(trimmed)) {
    return parts.join(' & ');
  }
  return trimmed
    .replace(/\s*\/\s*\\?\s*/g, ' & ')
    .replace(/\s+\/\s+/g, ' & ')
    .replace(/\s*[Λλ]\s*/g, ' & ')
    .trim();
}

/** True when tag likely lists 2+ distinct credited acts (duo/collab/remix pair). */
export function isLikelyMultiArtistTag(artist: string): boolean {
  const trimmed = artist.trim();
  if (!trimmed || shouldPreserveWholeAct(trimmed)) return false;
  return splitCollabParts(trimmed).length >= 2;
}

/** First credited artist from collab tags (Bad Omens, HEALTH → Bad Omens). */
export function primaryArtistName(artist: string): string {
  const parts = splitCollabParts(normalizeCollabArtistTag(artist));
  return parts[0]?.trim() || artist.trim();
}

/** All credited names from a collab tag string. */
export function collaboratorNames(artist: string): string[] {
  return splitCollabParts(normalizeCollabArtistTag(artist));
}

export function normalizeArtistKey(artist: string): string {
  return primaryArtistName(artist)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
