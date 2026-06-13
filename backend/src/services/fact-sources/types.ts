import type { FactScope } from '../fact-picker.js';

export type HarvestSource =
  | 'genius'
  | 'songfacts'
  | 'lastfm'
  | 'discogs'
  | 'whosampled'
  | 'secondhandsongs'
  | 'setlistfm'
  | 'rap-ru'
  | 'the-flow'
  | 'musixmatch'
  | 'wiki'
  | 'mb'
  | 'wikidata'
  | 'ddg'
  | 'web';

/** Genius/Last.fm/Setlist.fm parsers — relevance already checked; skip isBoringFact (live + bulk). */
export const PARSER_TRUSTED_SOURCES: ReadonlySet<HarvestSource> = new Set([
  'genius',
  'lastfm',
  'songfacts',
  'whosampled',
  'secondhandsongs',
  'setlistfm',
  'rap-ru',
  'the-flow',
  'discogs',
  'musixmatch',
]);

/** Album liner notes — dedicated Discogs pass in bulk seed. */
export const DISCOGS_HARVEST_SOURCE = 'discogs' as const;

export function isParserTrustedHarvestSource(source: HarvestSource): boolean {
  return PARSER_TRUSTED_SOURCES.has(source);
}

export interface HarvestedFact {
  fact: string;
  scope: FactScope;
  source: HarvestSource;
  /** Last.fm stats / album listing — store in bank, not progress success. */
  metadataOnly?: boolean;
}

export interface HarvestContext {
  artist: string;
  title: string;
  album?: string;
  countryCode?: string;
}
