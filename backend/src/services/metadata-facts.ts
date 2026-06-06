import type { ReferenceFactBundle } from './fact-picker.js';
import type { TrackMetadata } from './musicbrainz.js';

const COUNTRY_RU: Record<string, string> = {
  US: 'США',
  GB: 'Великобритании',
  RU: 'России',
  DE: 'Германии',
  FR: 'Франции',
  AU: 'Австралии',
  CA: 'Канады',
  JP: 'Японии',
  KR: 'Южной Кореи',
};

/** Verifiable facts from MusicBrainz / request metadata only — no web hallucinations. */
export function buildMetadataFallbackFacts(metadata: TrackMetadata): string[] {
  const facts: string[] = [];
  const { artist, title, year, genre, countryCode } = metadata;

  const origin =
    countryCode && COUNTRY_RU[countryCode]
      ? ` из ${COUNTRY_RU[countryCode]}`
      : countryCode
        ? ` (${countryCode})`
        : '';

  if (genre && year) {
    facts.push(
      `${artist} — ${genre}-исполнитель${origin}; трек «${title}» появился в ${year} году.`,
    );
  } else if (year) {
    facts.push(`${artist} выпустил трек «${title}» в ${year} году.`);
  } else if (genre) {
    facts.push(`${artist} — ${genre}-артист${origin}; в каталоге есть трек «${title}».`);
  } else if (origin) {
    facts.push(`${artist}${origin} — независимый артист с треком «${title}» в каталоге.`);
  } else {
    facts.push(`${artist} — независимый артист; «${title}» есть в музыкальных каталогах.`);
  }

  return facts.filter((f) => f.length >= 35);
}

/** Generic MusicBrainz-only placeholder — not enough to ground a story. */
export function isMetadataOnlyFallbackFact(fact: string): boolean {
  return /независимый артист|в каталоге есть трек|в музыкальных каталогах/i.test(fact);
}

export function countGroundedFacts(bundle: ReferenceFactBundle): number {
  return [...bundle.trackFacts, ...bundle.artistFacts].filter((f) => !isMetadataOnlyFallbackFact(f))
    .length;
}

/** Cyrillic title / RU context — MusicBrainz often empty; prefer ru.wikipedia and RU web. */
export function inferRuRegionalContext(artist: string, title: string, countryCode?: string): boolean {
  if (countryCode === 'RU') return true;
  return /[\u0400-\u04FF]/.test(`${artist} ${title}`);
}
