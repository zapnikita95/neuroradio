/** Covers without hardcoded song lists — explicit signal or artist-only pivot / hold. */

import type { ReferenceFactBundle } from './fact-picker.js';
import type { SelectedReferenceFact } from './fact-picker.js';
import { interestRating10 } from './fact-interest-log.js';
import {
  COVER_CONTEXT_RE,
  factAppliesToRequest,
  factMentionsArtist,
  factMentionsTitle,
  factNamesForeignEntity,
} from './fact-relevance.js';
import { interestScore } from './reference-fact-quality.js';

export { COVER_CONTEXT_RE };

const EXPLICIT_COVER_TITLE_RE =
  /\((?:[^)]*(?:cover|кавер|перепев)[^)]*)\)|\[(?:cover|кавер)\]|(?:^|\s)(?:cover|кавер)(?:\s|$)|(?:^|\s)(?:live\s+cover|cover\s+version)(?:\s|$)/i;

export type CoverSituation =
  | { action: 'proceed' }
  | { action: 'hold'; reason: string }
  | {
      action: 'pivot_artist';
      artistFact: SelectedReferenceFact;
      referenceFacts: string[];
    };

/** Cover only when title or facts say so — never from a static song→author map. */
export function isExplicitCover(title: string, facts: string[]): boolean {
  if (EXPLICIT_COVER_TITLE_RE.test(title)) return true;
  return facts.some((f) => COVER_CONTEXT_RE.test(f));
}

/** Track seed is about another act and we have no explicit cover marker. */
export function isAmbiguousCoverConflict(
  artist: string,
  title: string,
  seedFact: string,
  explicitCover: boolean,
): boolean {
  if (explicitCover) return false;
  const trimmed = seedFact.trim();
  if (!trimmed) return false;
  // Alias/label trivia about the performer is not a cover conflict (Moby as Voodoo Child, etc.).
  if (factMentionsArtist(trimmed, artist)) return false;
  return factNamesForeignEntity(trimmed, artist, title);
}

function pickArtistPivotFact(
  artist: string,
  title: string,
  bundle: ReferenceFactBundle,
): SelectedReferenceFact | null {
  const candidates = bundle.artistFacts.filter(
    (f) =>
      factAppliesToRequest(f, artist, title, 'artist') &&
      factMentionsArtist(f, artist) &&
      !factNamesForeignEntity(f, artist, title),
  );
  const best = [...candidates].sort((a, b) => interestScore(b) - interestScore(a))[0];
  if (!best) return null;
  return {
    fact: best,
    scope: 'artist',
    scopeLabelRu: 'группа/артист',
    interestScore: interestScore(best),
    interestRating: interestRating10(best),
  };
}

/**
 * - explicit cover → proceed with track facts
 * - foreign track seed, no cover marker → pivot to artist (fast) or hold
 * - hold = skip track story (no long fact hunt)
 */
export function assessCoverSituation(
  artist: string,
  title: string,
  selectedFact: SelectedReferenceFact | null,
  bundle: ReferenceFactBundle,
): CoverSituation {
  const seed = selectedFact?.fact?.trim() ?? '';
  const explicit = isExplicitCover(title, seed ? [seed] : []);

  if (explicit) return { action: 'proceed' };

  if (
    selectedFact &&
    selectedFact.interestScore >= 7 &&
    factMentionsArtist(seed, artist)
  ) {
    return { action: 'proceed' };
  }

  const titleOnlySeed =
    Boolean(seed) &&
    factMentionsTitle(seed, title) &&
    !factMentionsArtist(seed, artist);
  const trackSeedConflict =
    Boolean(seed) &&
    (selectedFact?.scope === 'track' || selectedFact?.scope === 'album') &&
    (titleOnlySeed || isAmbiguousCoverConflict(artist, title, seed, false));

  if (trackSeedConflict) {
    const pivot = pickArtistPivotFact(artist, title, bundle);
    if (pivot) {
      console.log(
        `[cover] pivot artist-only "${artist}" — track seed conflict, no explicit cover in "${title}"`,
      );
      return { action: 'pivot_artist', artistFact: pivot, referenceFacts: [pivot.fact] };
    }
    return { action: 'hold', reason: 'cover_ambiguous' };
  }

  const trackFacts = bundle.trackFacts;
  if (trackFacts.length > 0 && !explicit) {
    const allAboutOtherAct = trackFacts.every(
      (f) => !factMentionsArtist(f, artist) && factNamesForeignEntity(f, artist, title),
    );
    if (allAboutOtherAct) {
      const pivot = pickArtistPivotFact(artist, title, bundle);
      if (pivot) {
        console.log(
          `[cover] pivot artist-only "${artist}" — all track facts foreign, no cover marker`,
        );
        return { action: 'pivot_artist', artistFact: pivot, referenceFacts: [pivot.fact] };
      }
      return { action: 'hold', reason: 'cover_ambiguous' };
    }
  }

  return { action: 'proceed' };
}
