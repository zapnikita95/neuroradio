import type { SelectedReferenceFact } from './fact-picker.js';
import {
  factMentionsArtist,
  factMentionsTitle,
  hasTrackContextSignal,
  isWebListicleJunk,
} from './fact-relevance.js';
import { interestRating10 } from './fact-interest-log.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';
import { interestScore, isBoringFact } from './reference-fact-quality.js';

/** Last-resort seed from HTML search snippets when wiki/MB timed out. */
export function pickSalvageSnippetSeed(
  rawSnippets: string[],
  artist: string,
  title: string,
): SelectedReferenceFact | null {
  const ranked = rawSnippets
    .map((snippet) => snippet.trim())
    .filter((snippet) => snippet.length >= 35 && snippet.length <= 480)
    .filter((snippet) => !isWebListicleJunk(snippet))
    .filter((snippet) => !isBoringFact(snippet))
    .filter(
      (snippet) =>
        hasTrackContextSignal(snippet) ||
        factMentionsTitle(snippet, title) ||
        factMentionsArtist(snippet, artist),
    )
    .sort((a, b) => interestScore(b) - interestScore(a));

  const best = ranked[0];
  if (!best) return null;

  const scope =
    factMentionsTitle(best, title) || hasTrackContextSignal(best) ? 'track' : 'artist';
  return {
    fact: best,
    scope,
    scopeLabelRu: scope === 'track' ? 'трек' : 'группа/артист',
    interestScore: interestScore(best),
    interestRating: interestRating10(best),
  };
}

export function isWeakMetadataOnlySeed(
  selected: SelectedReferenceFact | null,
  referenceFacts: string[],
): boolean {
  if (!selected) return referenceFacts.every(isMetadataOnlyFallbackFact);
  return (
    selected.interestScore < 6 ||
    isMetadataOnlyFallbackFact(selected.fact) ||
    referenceFacts.every(isMetadataOnlyFallbackFact)
  );
}
