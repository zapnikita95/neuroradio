import type { SelectedReferenceFact } from './fact-picker.js';
import { factMentionsArtist, factMentionsTitle, factNamesForeignEntity, hasTrackContextSignal } from './fact-relevance.js';
import { interestRating10 } from './fact-interest-log.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';
import {
  interestScore,
  isAlbumListingSeed,
  isCatalogMetadataSeed,
  isWikiBiographyLead,
} from './reference-fact-quality.js';
import { acceptSearchGroundedSnippet, acceptIndieEmergingSnippet, isLyricsPageSeed, isPlaylistJunkSnippet, isSpeakableReferenceFact, isUnspeakableWebSeed } from './web-snippet-accept.js';
import { factFitsStoryLanguage } from './fact-language-fit.js';
import type { StoryLanguageId } from './story-language.js';

/** Seed too weak to ground LLM + quality gate — upgrade to wiki/better facts. */
export function isWeakSnippetSeed(fact: string, score = interestScore(fact)): boolean {
  const trimmed = fact.trim();
  if (isAlbumListingSeed(trimmed)) return true;
  if (isCatalogMetadataSeed(trimmed)) return true;
  if (isLyricsPageSeed(trimmed)) return true;
  if (score < 6) return true;
  if (isWikiBiographyLead(trimmed)) return true;
  return isUnspeakableWebSeed(trimmed) || !isSpeakableReferenceFact(trimmed);
}

export function isWeakSelectedFact(selected: SelectedReferenceFact | null, artist = ''): boolean {
  if (!selected) return true;
  const trimmed = selected.fact.trim();
  if (isCatalogMetadataSeed(trimmed)) return true;
  if (isLyricsPageSeed(trimmed)) return true;
  const score = Math.max(selected.interestScore ?? 0, interestScore(trimmed));
  if (score < 6) return true;
  if (isWikiBiographyLead(trimmed)) return true;
  return isUnspeakableWebSeed(trimmed) || !isSpeakableReferenceFact(trimmed, artist);
}

/** Last-resort seed from HTML search snippets when wiki/MB timed out. */
export function pickSalvageSnippetSeed(
  rawSnippets: string[],
  artist: string,
  title: string,
  storyLanguage: StoryLanguageId = 'ru',
): SelectedReferenceFact | null {
  const ranked = rawSnippets
    .map((snippet) => snippet.trim())
    .filter((snippet) => factFitsStoryLanguage(snippet, storyLanguage))
    .filter((snippet) => snippet.length >= 35 && snippet.length <= 480)
    .filter((snippet) => acceptSearchGroundedSnippet(snippet, artist, title))
    .filter((snippet) => !isPlaylistJunkSnippet(snippet, artist, title))
    .filter((snippet) => !factNamesForeignEntity(snippet, artist, title))
    .filter((snippet) => !isWeakSnippetSeed(snippet))
    .sort((a, b) => {
      const boost = (s: string) =>
        (factMentionsArtist(s, artist) ? 25 : 0) +
        (factMentionsTitle(s, title) ? 15 : 0) +
        (hasTrackContextSignal(s) ? 10 : 0);
      return interestScore(b) + boost(b) - (interestScore(a) + boost(a));
    });

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

/** Emerging/indie: truncated press clips (busking, TikTok) when strict accept fails. */
export function pickRelaxedSnippetSeed(
  rawSnippets: string[],
  artist: string,
  title: string,
  storyLanguage: StoryLanguageId = 'ru',
): SelectedReferenceFact | null {
  const ranked = rawSnippets
    .map((snippet) => snippet.trim())
    .filter((snippet) => factFitsStoryLanguage(snippet, storyLanguage))
    .filter((snippet) => snippet.length >= 35 && snippet.length <= 480)
    .filter((snippet) => acceptIndieEmergingSnippet(snippet, artist, title))
    .filter((snippet) => !isPlaylistJunkSnippet(snippet, artist, title))
    .sort((a, b) => {
      const boost = (s: string) =>
        (factMentionsArtist(s, artist) ? 25 : 0) +
        (factMentionsTitle(s, title) ? 15 : 0) +
        (hasTrackContextSignal(s) ? 10 : 0);
      return interestScore(b) + boost(b) - (interestScore(a) + boost(a));
    });

  const best = ranked[0];
  if (!best) return null;

  const score = Math.max(interestScore(best), 8);
  const scope =
    factMentionsTitle(best, title) || hasTrackContextSignal(best) ? 'track' : 'artist';
  return {
    fact: best,
    scope,
    scopeLabelRu: scope === 'track' ? 'трек' : 'группа/артист',
    interestScore: score,
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
