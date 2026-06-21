/** Resolve cover/karaoke titles to original artist + clean title for fact lookup. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGINAL_ARTIST_IN_TITLE_RE =
  /\((?:[^)]*\b(?:originally\s+(?:recorded|performed|written|sung)\s+by|originally\s+by|as\s+(?:made\s+)?famous\s+by|in\s+the\s+style\s+of|tribute\s+to)\s+([^)]+?))\)/i;

const EXPLICIT_COVER_MARKER_RE =
  /\((?:[^)]*(?:cover|кавер|перепев|karaoke|tribute)[^)]*)\)|\[(?:cover|кавер)\]|(?:^|\s)(?:cover|кавер)(?:\s|$)|(?:^|\s)(?:live\s+cover|cover\s+version)(?:\s|$)/i;

export interface CoverFactContext {
  performerArtist: string;
  performerTitle: string;
  factArtist: string;
  factTitle: string;
  isCover: boolean;
  originalArtist?: string;
  /** Short note for story prompt when this is a cover performance. */
  coverNoteRu?: string;
}

function stripParenthetical(title: string): string {
  return title
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseOriginalArtistFromTitle(title: string): string | null {
  const m = title.match(ORIGINAL_ARTIST_IN_TITLE_RE);
  if (!m?.[1]) return null;
  const raw = m[1]
    .replace(/\b(?:originally\s+(?:recorded|performed|written|sung)\s+by|originally\s+by|as\s+(?:made\s+)?famous\s+by|in\s+the\s+style\s+of|tribute\s+to)\s*/i, '')
    .trim();
  if (raw.length < 2 || raw.length > 80) return null;
  return raw;
}

export function isExplicitCoverTitle(title: string): boolean {
  if (EXPLICIT_COVER_MARKER_RE.test(title)) return true;
  return ORIGINAL_ARTIST_IN_TITLE_RE.test(title);
}

interface KnownCoverOriginal {
  title: string;
  originalArtist: string;
}

let knownCoverByTitle: Map<string, KnownCoverOriginal> | null = null;

/** Accent-insensitive title key for known-cover lookup. */
export function normalizeCoverTitleKey(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function loadKnownCoverOriginals(): Map<string, KnownCoverOriginal> {
  if (knownCoverByTitle) return knownCoverByTitle;
  const dir = dirname(fileURLToPath(import.meta.url));
  let rows: KnownCoverOriginal[] = [];
  try {
    rows = JSON.parse(
      readFileSync(join(dir, '../data/known-cover-originals.json'), 'utf8'),
    ) as KnownCoverOriginal[];
  } catch {
    rows = [];
  }
  knownCoverByTitle = new Map();
  for (const row of rows) {
    const key = normalizeCoverTitleKey(row.title);
    if (key) knownCoverByTitle.set(key, row);
  }
  return knownCoverByTitle;
}

function lookupKnownOriginal(title: string): KnownCoverOriginal | null {
  return loadKnownCoverOriginals().get(normalizeCoverTitleKey(title)) ?? null;
}

function artistsDiffer(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  return na !== nb && !na.includes(nb) && !nb.includes(na);
}

/** Map performer + long cover title → original act for wiki/MB fact fetch. */
export function resolveCoverForFacts(artist: string, title: string): CoverFactContext {
  const performerArtist = artist.trim();
  const performerTitle = title.trim();
  const originalArtist = parseOriginalArtistFromTitle(performerTitle);
  const cleanTitle = stripParenthetical(performerTitle);

  if (originalArtist) {
    return {
      performerArtist,
      performerTitle,
      factArtist: originalArtist,
      factTitle: cleanTitle || performerTitle,
      isCover: true,
      originalArtist,
      coverNoteRu: `Сейчас играет кавер (${performerArtist}); рассказываем про оригинал — ${originalArtist}, трек ${cleanTitle}.`,
    };
  }

  if (EXPLICIT_COVER_MARKER_RE.test(performerTitle)) {
    return {
      performerArtist,
      performerTitle,
      factArtist: performerArtist,
      factTitle: cleanTitle || performerTitle,
      isCover: true,
      coverNoteRu: `Это кавер-версия трека ${cleanTitle}.`,
    };
  }

  const known = lookupKnownOriginal(cleanTitle || performerTitle);
  if (known && artistsDiffer(performerArtist, known.originalArtist)) {
    const factTitle = known.title.trim() || cleanTitle || performerTitle;
    return {
      performerArtist,
      performerTitle,
      factArtist: known.originalArtist.trim(),
      factTitle,
      isCover: true,
      originalArtist: known.originalArtist.trim(),
      coverNoteRu: `Сейчас играет кавер (${performerArtist}); рассказываем про оригинал — ${known.originalArtist.trim()}, трек «${factTitle}».`,
    };
  }

  return {
    performerArtist,
    performerTitle,
    factArtist: performerArtist,
    factTitle: cleanTitle || performerTitle,
    isCover: false,
  };
}

/** Title-only match for curated / bank lookup (ignore cover suffixes). */
export function normalizeTitleForLookup(title: string): string {
  return stripParenthetical(title).toLowerCase();
}
