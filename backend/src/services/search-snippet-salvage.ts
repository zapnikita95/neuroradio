import type { ReferenceFactBundle, SelectedReferenceFact } from './fact-picker.js';
import { buildSelectedReferenceFact } from './fact-picker.js';
import { factMentionsArtist, factMentionsTitle, factNamesForeignEntity, hasTrackContextSignal } from './fact-relevance.js';
import { isTrackTitleAnchoredSeed } from './fact-track-anchor.js';
import { interestRating10 } from './fact-interest-log.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';
import {
  interestScore,
  isAlbumListingSeed,
  isBoringFact,
  isCatalogMetadataSeed,
  isDiscogsPackagingSeed,
  isEncyclopediaDefinitionSeed,
  isListeningStatsFact,
  isSetlistLiveDebutSeed,
  isStudioEquipmentCatalogSeed,
  isThinReleaseCatalogSeed,
  isWikiBiographyLead,
} from './reference-fact-quality.js';
import { acceptSearchGroundedSnippet, acceptIndieEmergingSnippet, isLyricsPageSeed, isPlaylistJunkSnippet, isSpeakableReferenceFact, isUnspeakableWebSeed } from './web-snippet-accept.js';
import { isRejectedPickSeed } from './fact-seed-pick.js';
import { isRejectedStorySeed } from './fact-picker.js';
import { factFitsStoryLanguage } from './fact-language-fit.js';
import type { StoryLanguageId } from './story-language.js';

/** Seed too weak to ground LLM + quality gate — upgrade to wiki/better facts. */
export function isWeakSnippetSeed(fact: string, score = interestScore(fact), title = ''): boolean {
  const trimmed = fact.trim();
  if (isAlbumListingSeed(trimmed)) return true;
  if (isListeningStatsFact(trimmed)) return true;
  if (isCatalogMetadataSeed(trimmed)) return true;
  if (isSetlistLiveDebutSeed(trimmed)) return true;
  if (isLyricsPageSeed(trimmed)) return true;
  if (isEncyclopediaDefinitionSeed(trimmed)) return true;
  if (title && isTrackTitleAnchoredSeed(trimmed, title) && !isEncyclopediaDefinitionSeed(trimmed)) return false;
  if (score < 6) return true;
  if (isWikiBiographyLead(trimmed)) return true;
  return isUnspeakableWebSeed(trimmed) || !isSpeakableReferenceFact(trimmed, '', title);
}

export function isWeakSelectedFact(
  selected: SelectedReferenceFact | null,
  artist = '',
  title = '',
): boolean {
  if (!selected) return true;
  const trimmed = selected.fact.trim();
  if (isThinReleaseCatalogSeed(trimmed)) return true;
  if (isStudioEquipmentCatalogSeed(trimmed)) return true;
  if (isCatalogMetadataSeed(trimmed)) return true;
  if (isListeningStatsFact(trimmed)) return true;
  if (isDiscogsPackagingSeed(trimmed)) return true;
  if (isSetlistLiveDebutSeed(trimmed)) return true;
  if (isLyricsPageSeed(trimmed)) return true;
  if (/^["'][\p{L}\p{N}\s'-]+["']\s+is a song by the (?:rock )?band\b/iu.test(trimmed)) return true;
  const score = Math.max(selected.interestScore ?? 0, interestScore(trimmed));
  if (isEncyclopediaDefinitionSeed(trimmed)) {
    if (
      score >= 40 &&
      /\b(?:released|single|album|chart|billboard|debut|may \d{4}|june \d{4}|july \d{4})\b/i.test(trimmed)
    ) {
      // Concrete release facts (e.g. fifth single from album + date) are usable seeds.
    } else {
      return true;
    }
  }
  if (title && isTrackTitleAnchoredSeed(trimmed, title) && score >= 10 && !isBoringFact(trimmed)) return false;
  if (score < 6) return true;
  if (selected.scope === 'artist' && score < 12) return true;
  if (selected.scope === 'artist' && (selected.interestRating ?? 0) < 7) return true;
  if (isWikiBiographyLead(trimmed)) return true;
  return isUnspeakableWebSeed(trimmed) || !isSpeakableReferenceFact(trimmed, artist, title);
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
    .filter((snippet) => !isWeakSnippetSeed(snippet, interestScore(snippet), title))
    .filter((snippet) => !isRejectedPickSeed(snippet, title, storyLanguage, [], artist))
    .filter((snippet) => !isRejectedStorySeed(snippet, artist, title, [], storyLanguage))
    .sort((a, b) => {
      const boost = (s: string) =>
        (factMentionsArtist(s, artist) ? 25 : 0) +
        (factMentionsTitle(s, title) ? 15 : 0) +
        (hasTrackContextSignal(s) ? 10 : 0) +
        (isSetlistLiveDebutSeed(s) ? -40 : 0);
      return interestScore(b) + boost(b) - (interestScore(a) + boost(a));
    });

  const best = ranked[0];
  if (!best || interestScore(best) < 6) return null;

  return buildSelectedReferenceFact(best, artist, title);
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
        (hasTrackContextSignal(s) ? 10 : 0) +
        (isSetlistLiveDebutSeed(s) ? -40 : 0);
      return interestScore(b) + boost(b) - (interestScore(a) + boost(a));
    });

  const best = ranked[0];
  if (!best) return null;

  const score = Math.max(interestScore(best), 8);
  return buildSelectedReferenceFact(best, artist, title, 'auto', undefined);
}

export function enrichFactBundleWithRawSnippets(
  bundle: ReferenceFactBundle,
  rawSnippets: string[],
): ReferenceFactBundle {
  const extras = rawSnippets
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length >= 35 &&
        s.length <= 480 &&
        !isSetlistLiveDebutSeed(s) &&
        !isListeningStatsFact(s) &&
        !isStudioEquipmentCatalogSeed(s),
    );
  if (extras.length === 0) return bundle;
  return {
    trackFacts: [...new Set([...bundle.trackFacts, ...extras])],
    artistFacts: bundle.artistFacts,
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
