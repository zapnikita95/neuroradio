import {
  adjustedInterestScore,
  interestScore,
  isAlbumListingSeed,
  isArtistFormationBioSeed,
  isCatalogMetadataSeed,
  isCitationBibliographySeed,
  isArtistDisambiguationListSeed,
  isDiscogsLinerNotesSeed,
  isEncyclopediaDefinitionSeed,
  isGenericConcertVenueSeed,
  isGenericMusicVideoSeed,
  isBoringFact,
  isCollectorFact,
  isWeakChartSeed,
  MIN_PICK_INTEREST_SCORE,
  isBackstoryFact,
} from './reference-fact-quality.js';
import { WEAK_TRIVIA_PATTERNS } from './story-fact-hunt.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';
import { isTruncatedMarketingSnippet, isUnspeakableWebSeed, isArtistIdentityBioSnippet } from './web-snippet-accept.js';
import {
  factMentionsTitle,
  factMentionsArtistLoose,
  hasTrackContextSignal,
  factMentionsOtherTrackTitle,
  isMisattributedBandTrackFact,
} from './fact-relevance.js';
import { hasAnchoredTrackContext, isTrackTitleAnchoredSeed, rejectSeedForTrackStory } from './fact-track-anchor.js';
import { factFitsStoryLanguage } from './fact-language-fit.js';
import type { StoryLanguageId } from './story-language.js';
import { interestRating10 } from './fact-interest-log.js';
import type { RankedFactScope } from './fact-ranking.js';

/** Shared reject gates for live pick + bank pick + push hot — одна логика с pickReferenceFact. */
export function isRejectedPickSeed(
  fact: string,
  title = '',
  storyLanguage: StoryLanguageId = 'ru',
  trackPool: string[] = [],
  artist = '',
  pickScope?: RankedFactScope,
): boolean {
  const artistScope = pickScope === 'artist';
  const albumScope = pickScope === 'album';
  const nonTrackScope = artistScope || albumScope;

  if (title.trim() && factMentionsOtherTrackTitle(fact, title)) return true;
  if (!factFitsStoryLanguage(fact, storyLanguage)) return true;
  if (
    !nonTrackScope &&
    artist.trim() &&
    !factMentionsArtistLoose(fact, artist) &&
    !hasAnchoredTrackContext(fact, title) &&
    !hasTrackContextSignal(fact)
  ) {
    return true;
  }
  if (
    !nonTrackScope &&
    title.trim() &&
    artist &&
    rejectSeedForTrackStory(fact, artist, title, { trackPoolFacts: trackPool })
  ) {
    return true;
  }
  if (isAlbumListingSeed(fact)) return true;
  if (isCatalogMetadataSeed(fact)) return true;
  if (isCitationBibliographySeed(fact)) return true;
  if (
    isEncyclopediaDefinitionSeed(fact) &&
    !(
      title.trim() &&
      isTrackTitleAnchoredSeed(fact, title) &&
      interestScore(fact) >= 10
    )
  ) {
    return true;
  }
  if (isArtistDisambiguationListSeed(fact)) return true;
  if (isDiscogsLinerNotesSeed(fact)) return true;
  if (
    !artistScope &&
    title.trim() &&
    isArtistIdentityBioSnippet(fact) &&
    !factMentionsTitle(fact, title) &&
    !hasAnchoredTrackContext(fact, title)
  ) {
    return true;
  }
  if (isGenericConcertVenueSeed(fact)) return true;
  if (isGenericMusicVideoSeed(fact)) return true;
  if (
    !artistScope &&
    title.trim() &&
    isArtistFormationBioSeed(fact) &&
    trackPool.some((t) => factMentionsTitle(t, title) && adjustedInterestScore(t) >= 6)
  ) {
    return true;
  }
  if (
    !nonTrackScope &&
    title.trim() &&
    !factMentionsTitle(fact, title) &&
    !hasTrackContextSignal(fact) &&
    trackPool.some((t) => factMentionsTitle(t, title) && adjustedInterestScore(t) >= 12)
  ) {
    return true;
  }
  if (isMetadataOnlyFallbackFact(fact)) return true;
  if (!artistScope && title && isMisattributedBandTrackFact(fact, title)) return true;
  if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(fact))) return true;
  if (isWeakChartSeed(fact)) return true;
  const allowArtistBio =
    artistScope &&
    (isArtistIdentityBioSnippet(fact) ||
      isArtistFormationBioSeed(fact) ||
      isBackstoryFact(fact) ||
      /\b(?:frontman|lead singer|co[- ]?founder|started (?:his|her|their) solo career|until its break-up)\b/i.test(fact));
  if (
    !allowArtistBio &&
    isBoringFact(fact) &&
    !(
      title &&
      isTrackTitleAnchoredSeed(fact, title) &&
      (interestScore(fact) >= 10 || !isEncyclopediaDefinitionSeed(fact))
    )
  ) {
    return true;
  }
  if (
    !allowArtistBio &&
    isCollectorFact(fact) &&
    !(title && factMentionsTitle(fact, title)) &&
    !/\b(?:inspired by|intended to|anti-war|protest song|meaning|metaphor)\b/i.test(fact)
  ) {
    return true;
  }
  if (isTruncatedMarketingSnippet(fact)) return true;
  if (isUnspeakableWebSeed(fact)) return true;
  if (
    title.trim() &&
    /впервые прозвучала на живом выступлении/i.test(fact) &&
    trackPool.some((t) => /\bco[- ]?written\b/i.test(t) && adjustedInterestScore(t) >= 12)
  ) {
    return true;
  }
  return false;
}

export function computeLiveInterest(fact: string): { score: number; rating: number } {
  const score = interestScore(fact);
  return { score, rating: interestRating10(fact) };
}

const HOT_MIN_RATING = 6;

/** Push hint + bank hot pool — пересчёт по текущим правилам, не замороженный isHot. */
export function isEligibleHotFact(
  fact: string,
  opts: {
    metadata?: boolean;
    artist?: string;
    title?: string;
    trackPool?: string[];
    storyLanguage?: StoryLanguageId;
  } = {},
): boolean {
  if (opts.metadata) return false;
  const { score, rating } = computeLiveInterest(fact);
  if (rating < HOT_MIN_RATING || score < MIN_PICK_INTEREST_SCORE) return false;
  if (
    isRejectedPickSeed(
      fact,
      opts.title ?? '',
      opts.storyLanguage ?? 'ru',
      opts.trackPool ?? [],
      opts.artist ?? '',
    )
  ) {
    return false;
  }
  return true;
}
