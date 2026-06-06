import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primaryArtistName } from './artist-primary.js';
import type { ReferenceFactBundle } from './fact-picker.js';
import { factAppliesToRequest } from './fact-relevance.js';
import type { TrackMetadata } from './musicbrainz.js';

export type ArtistTier = 'major' | 'indie';

const __dir = dirname(fileURLToPath(import.meta.url));
let catalogMajor: Set<string> | null = null;

function loadCatalogMajor(): Set<string> {
  if (catalogMajor) return catalogMajor;
  try {
    const raw = readFileSync(join(__dir, '../data/known-artists.json'), 'utf8');
    const data = JSON.parse(raw) as { artists?: string[] };
    catalogMajor = new Set((data.artists ?? []).map(normalizeArtist));
    console.log(`[artist-tier] loaded ${catalogMajor.size} known artists`);
  } catch {
    catalogMajor = new Set(FALLBACK_MAJOR);
    console.warn(`[artist-tier] known-artists.json missing — using ${catalogMajor.size} fallback names`);
  }
  return catalogMajor;
}

function normalizeArtist(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const FALLBACK_MAJOR = [
  'taylor swift', 'beyonce', 'jay z', 'drake', 'eminem', 'coldplay', 'bts', 'blackpink',
  'green day', 'metallica', 'queen', 'the beatles', 'madonna', 'rihanna', 'alvaro soler',
  'moby', 'arash', 'tame impala',
];

/** Популярны в РФ, но часто без MusicBrainz / en.wikipedia. */
const RU_REGIONAL_MAJOR = [
  'soltwine', 'oxxxymiron', 'morgenshtern', 'kizaru', 'pharaoh', 'saluki', 'knyaz',
  'kino', 'кино', 'виктор цой', 'bi 2', 'баста', 'макан', 'anacondaz', 'loqiemean',
  'pyrokinesis', 'face', 'feduk', 'scriptonite', 'eldzhey', 'эльджей',
];

/** Европейский рок/поп — часто выпадают из top-1000 Wikipedia list. */
const EUROPEAN_ROCK_MAJOR = [
  'the rasmus', 'him', 'nightwish', 'children of bodom', 'lordi', 'apocalyptica',
  'within temptation', 'epica', 'rammstein', 'scorpions', 'aqua', 'ace of base',
  'a-ha', 'robbie williams', 'placebo', 'muse', 'the killers',
  'arctic monkeys', 'the strokes', 'linkin park', 'green day', 'blink-182',
];

const KPOP_PATTERN =
  /\b(bts|blackpink|twice|stray kids|newjeans|aespa|itzy|seventeen|nct|exo|bigbang|super junior|girls'? generation|red velvet|ive|le sserafim|txt|enhypen|ateez|gidle|mamamoo)\b/i;

function validatedFactCount(
  bundle: ReferenceFactBundle,
  artist: string,
  title: string,
): { track: number; artist: number } {
  const track = bundle.trackFacts.filter((f) => factAppliesToRequest(f, artist, title, 'track')).length;
  const artistN = bundle.artistFacts.filter((f) => factAppliesToRequest(f, artist, title, 'artist')).length;
  return { track, artist: artistN };
}

function isRuRegionalMajorArtist(artist: string): boolean {
  const n = normalizeArtist(artist);
  return RU_REGIONAL_MAJOR.some((name) => n === normalizeArtist(name) || n.includes(normalizeArtist(name)));
}

function isEuropeanRockMajorArtist(artist: string): boolean {
  const n = normalizeArtist(artist);
  return EUROPEAN_ROCK_MAJOR.some((name) => n === normalizeArtist(name) || n.includes(normalizeArtist(name)));
}

export function isCatalogMajorArtist(artist: string): boolean {
  const catalog = loadCatalogMajor();
  const n = normalizeArtist(artist);
  if (catalog.has(n)) return true;
  if (isRuRegionalMajorArtist(artist)) return true;
  if (isEuropeanRockMajorArtist(artist)) return true;
  return KPOP_PATTERN.test(artist);
}

export function resolveArtistTier(
  artist: string,
  title: string,
  metadata: TrackMetadata,
  bundle: ReferenceFactBundle,
): ArtistTier {
  const primary = primaryArtistName(artist);
  if (isCatalogMajorArtist(primary) || isCatalogMajorArtist(artist)) return 'major';

  const counts = validatedFactCount(bundle, primary, title);
  if (counts.track >= 1) return 'major';
  if (counts.artist >= 2) return 'major';

  void metadata;
  void title;
  return 'indie';
}

export function tierRequiresTrackFact(tier: ArtistTier): boolean {
  return tier === 'major';
}

/** Reload catalog in tests / after deploy. */
export function resetKnownArtistCatalog(): void {
  catalogMajor = null;
}
