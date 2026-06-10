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

export interface HarvestedFact {
  fact: string;
  scope: FactScope;
  source: HarvestSource;
}

export interface HarvestContext {
  artist: string;
  title: string;
  album?: string;
  countryCode?: string;
}
