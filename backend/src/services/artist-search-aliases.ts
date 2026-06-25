/**
 * Artist abbreviations ↔ full names for harvest, relevance, and wiki search.
 * Aliases from artist-pronunciation.json + built-in expansions.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collaboratorNames, normalizeCollabArtistTag, primaryArtistName } from './artist-primary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type PronEntry = { aliases?: string[] };
let aliasByArtist: Map<string, string[]> | null = null;

function loadAliasMap(): Map<string, string[]> {
  if (aliasByArtist) return aliasByArtist;
  aliasByArtist = new Map();
  try {
    const raw = readFileSync(resolve(__dirname, '../data/artist-pronunciation.json'), 'utf8');
    const data = JSON.parse(raw) as { artists?: Record<string, PronEntry> };
    for (const [key, entry] of Object.entries(data.artists ?? {})) {
      const names = [key, ...(entry.aliases ?? [])].map((s) => s.trim()).filter(Boolean);
      aliasByArtist.set(normalize(key), names);
    }
  } catch {
    aliasByArtist = new Map();
  }
  return aliasByArtist;
}

/** Built-in expansions not yet in JSON. */
const EXTRA_ALIASES: Record<string, string[]> = {
  mgk: ['machine gun kelly', 'colson baker', "machine gun kelly's"],
};

export function artistHasSearchAliases(artist: string): boolean {
  return expandArtistSearchNames(artist).length > 2;
}

/** All searchable names for an artist (original, primary, aliases). */
export function expandArtistSearchNames(artist: string): string[] {
  const primary = primaryArtistName(artist);
  const normalizedTag = normalizeCollabArtistTag(artist);
  const out: string[] = [artist.trim(), normalizedTag, primary];
  const collabs = collaboratorNames(artist);
  if (collabs.length === 2) {
    out.push(`${collabs[0]} & ${collabs[1]}`, `${collabs[0]} and ${collabs[1]}`);
  }
  out.push(...collabs);
  const map = loadAliasMap();
  const fromJson =
    map.get(normalize(primary)) ??
    map.get(normalize(normalizedTag)) ??
    map.get(normalize(artist)) ??
    [];
  out.push(...fromJson);
  const extra =
    EXTRA_ALIASES[normalize(primary)] ??
    EXTRA_ALIASES[normalize(normalizedTag)] ??
    EXTRA_ALIASES[normalize(artist)] ??
    [];
  out.push(...extra);
  const seen = new Set<string>();
  return out.filter((name) => {
    const key = normalize(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Harvest/API: does candidate act name match requested artist (incl. mgk ↔ Machine Gun Kelly)? */
export function artistsMatchForHarvest(requestedArtist: string, candidateName: string): boolean {
  const cand = normalize(candidateName);
  if (!cand) return false;
  for (const name of expandArtistSearchNames(requestedArtist)) {
    const n = normalize(name);
    if (n.length < 2) continue;
    if (n === cand) return true;
    if (n.length >= 3 && cand.includes(n)) return true;
    if (cand.length >= 3 && n.includes(cand)) return true;
  }
  return false;
}

/** Fact mentions artist or any known alias (mgk → machine gun kelly). */
export function factMentionsArtistOrAlias(fact: string, artist: string): boolean {
  const factNorm = normalize(fact);
  for (const name of expandArtistSearchNames(artist)) {
    const n = normalize(name);
    if (n.length >= 3 && factNorm.includes(n)) return true;
    if (n.length === 3 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(factNorm)) {
      return true;
    }
  }
  return false;
}
