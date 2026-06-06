import type { SelectedReferenceFact } from './fact-picker.js';
import { factMentionsTitle, hasTrackContextSignal } from './fact-relevance.js';
import { interestRating10 } from './fact-interest-log.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';
import { interestScore } from './reference-fact-quality.js';
import { acceptSearchGroundedSnippet, isTruncatedMarketingSnippet } from './web-snippet-accept.js';

/** Seed too weak to ground LLM + quality gate — upgrade to wiki/better facts. */
export function isWeakSnippetSeed(fact: string, score = interestScore(fact)): boolean {
  const trimmed = fact.trim();
  if (score < 6) return true;
  return isTruncatedMarketingSnippet(trimmed);
}

export function isWeakSelectedFact(selected: SelectedReferenceFact | null): boolean {
  if (!selected) return true;
  return isWeakSnippetSeed(selected.fact, selected.interestScore);
}

/** Last-resort seed from HTML search snippets when wiki/MB timed out. */
export function pickSalvageSnippetSeed(
  rawSnippets: string[],
  artist: string,
  title: string,
): SelectedReferenceFact | null {
  const ranked = rawSnippets
    .map((snippet) => snippet.trim())
    .filter((snippet) => snippet.length >= 35 && snippet.length <= 480)
    .filter((snippet) => acceptSearchGroundedSnippet(snippet, artist, title))
    .filter((snippet) => !isWeakSnippetSeed(snippet))
    .sort((a, b) => interestScore(b) - interestScore(a));

  const best = ranked[0];
  if (!best || interestScore(best) < 6) return null;

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
