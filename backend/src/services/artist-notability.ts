import type { ReferenceFactBundle } from './fact-picker.js';
import { factAppliesToRequest } from './fact-relevance.js';
import type { TrackMetadata } from './musicbrainz.js';

export type ArtistTier = 'major' | 'indie';

/** Top-tier acts — track-specific facts required when possible. */
const CATALOG_MAJOR = new Set(
  [
    'taylor swift', 'beyonce', 'beyoncé', 'jay z', 'jay-z', 'rihanna', 'drake', 'kanye west',
    'eminem', 'ed sheeran', 'adele', 'coldplay', 'radiohead', 'u2', 'metallica', 'nirvana',
    'queen', 'the beatles', 'led zeppelin', 'pink floyd', 'michael jackson', 'madonna', 'prince',
    'elvis presley', 'bob dylan', 'david bowie', 'frank sinatra', 'ariana grande', 'billie eilish',
    'olivia rodrigo', 'harry styles', 'bruno mars', 'the weeknd', 'post malone', 'travis scott',
    'kendrick lamar', 'snoop dogg', '50 cent', 'lil wayne', 'nicki minaj', 'lady gaga', 'katy perry',
    'shakira', 'jennifer lopez', 'justin bieber', 'justin timberlake', 'maroon 5', 'imagine dragons',
    'twenty one pilots', 'foo fighters', 'green day', 'linkin park', 'red hot chili peppers',
    'pearl jam', 'ac dc', 'ac/dc', 'guns n roses', 'bon jovi', 'abba', 'bee gees', 'bts', 'blackpink',
    'twice', 'stray kids', 'newjeans', 'aespa', 'itzy', 'seventeen', 'exo', 'bigbang', 'super junior',
    'red velvet', 'ive', 'le sserafim', 'dr dre', 'britney spears', 'whitney houston', 'mariah carey',
    'stevie wonder', 'aretha franklin', 'elton john', 'freddie mercury', 'amy winehouse', 'dua lipa',
    'bad bunny', 'shawn mendes', 'camila cabello', 'miley cyrus', 'pink', 'kelly clarkson',
  ].map((name) => name.toLowerCase()),
);

const KPOP_PATTERN =
  /\b(bts|blackpink|twice|stray kids|newjeans|aespa|itzy|seventeen|nct|exo|bigbang|super junior|girls'? generation|red velvet|ive|le sserafim|txt|enhypen|ateez|gidle|mamamoo)\b/i;

function normalizeArtist(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validatedFactCount(
  bundle: ReferenceFactBundle,
  artist: string,
  title: string,
): { track: number; artist: number } {
  const track = bundle.trackFacts.filter((f) => factAppliesToRequest(f, artist, title, 'track')).length;
  const artistN = bundle.artistFacts.filter((f) => factAppliesToRequest(f, artist, title, 'artist')).length;
  return { track, artist: artistN };
}

export function isCatalogMajorArtist(artist: string): boolean {
  const n = normalizeArtist(artist);
  if (CATALOG_MAJOR.has(n)) return true;
  for (const token of n.split(' ')) {
    if (token.length >= 4 && CATALOG_MAJOR.has(token)) return true;
  }
  return KPOP_PATTERN.test(artist);
}

/**
 * major — Wikipedia/источники с богатой дискографией; нужен факт про трек или сильный про артиста.
 * indie — мало данных; достаточно честной биографии из проверенных метаданных.
 */
export function resolveArtistTier(
  artist: string,
  title: string,
  metadata: TrackMetadata,
  bundle: ReferenceFactBundle,
): ArtistTier {
  if (isCatalogMajorArtist(artist)) return 'major';

  const counts = validatedFactCount(bundle, artist, title);
  if (counts.track >= 1) return 'major';
  if (counts.artist >= 2) return 'major';

  void metadata;
  void title;
  return 'indie';
}

export function tierRequiresTrackFact(tier: ArtistTier): boolean {
  return tier === 'major';
}
