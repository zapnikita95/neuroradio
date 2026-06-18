import { factFingerprint } from './fact-bank.js';
import { classifyFactTopic, factsShareTopicOrOverlap, type FactTopicKey } from './fact-topic.js';
import {
  filterAndRankFacts,
  interestScore,
  adjustedInterestScore,
  isAlbumListingSeed,
  isArtistFormationBioSeed,
  isCatalogMetadataSeed,
  isCitationBibliographySeed,
  isGenericConcertVenueSeed,
  isGenericMusicVideoSeed,
  isBackstoryFact,
  isBoringFact,
  isCollectorFact,
  isWeakChartSeed,
  isEncyclopediaDefinitionSeed,
  MIN_PICK_INTEREST_SCORE,
} from './reference-fact-quality.js';
import type { StoryNarratorId } from './story-narrator.js';
import { interestRating10 } from './fact-interest-log.js';
import { WEAK_TRIVIA_PATTERNS } from './story-fact-hunt.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';
import { isTruncatedMarketingSnippet, isUnspeakableWebSeed } from './web-snippet-accept.js';
import { splitBundleByScope, type RankedFactScope } from './fact-ranking.js';
import {
  factMentionsTitle,
  hasTrackContextSignal,
  isAlbumScopeFact,
  factMentionsOtherTrackTitle,
  isMisattributedBandTrackFact,
  isNonMusicTitleCollisionFact,
} from './fact-relevance.js';
import { rejectSeedForTrackStory, isTrackTitleAnchoredSeed } from './fact-track-anchor.js';
import { factFitsStoryLanguage } from './fact-language-fit.js';
import type { StoryLanguageId } from './story-language.js';
import { isRejectedPickSeed } from './fact-seed-pick.js';

export type FactScope = RankedFactScope;

export interface ReferenceFactBundle {
  artistFacts: string[];
  trackFacts: string[];
}

export interface SelectedReferenceFact {
  fact: string;
  scope: FactScope;
  scopeLabelRu: string;
  interestScore: number;
  interestRating: number;
}

const SCOPE_LABEL: Record<FactScope, string> = {
  track: 'трек',
  album: 'альбом',
  artist: 'группа/артист',
};

/** Минимум interestScore в scope, иначе спускаемся на альбом/артиста или LLM. */
export const MIN_GOOD_SCOPE_INTEREST = parseInt(process.env.MIN_FACT_INTEREST_SCORE ?? '12', 10);

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantWords(text: string): string[] {
  return normalizeForMatch(text)
    .split(' ')
    .filter((word) => word.length >= 5);
}

function dedupeFacts(facts: string[]): string[] {
  return filterAndRankFacts(facts);
}

const MUSIC_VIDEO_TOPIC =
  /\b(music video|official video|video was directed|video for|accompanying music video|клип|music video for)\b/i;

function overlapThreshold(factWordCount: number, strict: boolean): number {
  if (strict) return Math.min(2, Math.max(2, Math.ceil(factWordCount * 0.28)));
  return Math.min(3, Math.max(2, Math.ceil(factWordCount * 0.45)));
}

function factsShareTopic(a: string, b: string): boolean {
  if (MUSIC_VIDEO_TOPIC.test(a) && MUSIC_VIDEO_TOPIC.test(b)) return true;
  return false;
}

export function factOverlapsPrevious(fact: string, previousScripts: string[], strict = false): boolean {
  const factWords = significantWords(fact);
  if (factWords.length === 0) return false;

  for (const script of previousScripts) {
    if (factsShareTopic(fact, script)) {
      const scriptWords = new Set(significantWords(script));
      const hits = factWords.filter((word) => scriptWords.has(word)).length;
      if (hits >= 2) return true;
    }
    const scriptWords = new Set(significantWords(script));
    const hits = factWords.filter((word) => scriptWords.has(word)).length;
    const threshold = overlapThreshold(factWords.length, strict);
    if (hits >= threshold) return true;
  }
  return false;
}

/** Same track/artist — reject duplicate topic or near-duplicate text across sources. */
export function factsTooSimilar(candidate: string, recentFacts: string[]): boolean {
  if (!candidate.trim() || recentFacts.length === 0) return false;
  for (const recent of recentFacts) {
    if (factsShareTopicOrOverlap(candidate, recent)) return true;
    if (factOverlapsPrevious(candidate, [recent], true)) return true;
  }
  return false;
}

export function resolveScopeOrder(
  storyIndex: number,
  recentScopes: FactScope[] = [],
): FactScope[] {
  const last3 = recentScopes.slice(0, 3);
  if (last3.length >= 2 && last3.every((s) => s === 'track')) {
    return ['artist', 'album', 'track'];
  }
  if (last3.length >= 2 && last3.every((s) => s === 'artist')) {
    return ['track', 'album', 'artist'];
  }
  return storyIndex % 2 === 1 ? ['artist', 'album', 'track'] : ['track', 'album', 'artist'];
}

function isRejectedSeed(
  fact: string,
  title = '',
  storyLanguage: StoryLanguageId = 'ru',
  trackPool: string[] = [],
  artist = '',
): boolean {
  return isRejectedPickSeed(fact, title, storyLanguage, trackPool, artist);
}

function sortByInterest(facts: string[], narrator: StoryNarratorId = 'auto'): string[] {
  return [...facts].sort(
    (a, b) => adjustedInterestScore(b, narrator) - adjustedInterestScore(a, narrator),
  );
}

function isUsedFact(fact: string, usedFingerprints: Set<string>): boolean {
  return usedFingerprints.has(factFingerprint(fact));
}

function pickBestByInterest(
  facts: string[],
  previousScripts: string[],
  usedFingerprints: Set<string>,
  minScore = MIN_PICK_INTEREST_SCORE,
  title = '',
  narrator: StoryNarratorId = 'auto',
  blockedTopics: Set<FactTopicKey> = new Set(),
  storyLanguage: StoryLanguageId = 'ru',
  trackPool: string[] = [],
  artist = '',
): string | null {
  for (const fact of sortByInterest(facts, narrator)) {
    if (isRejectedSeed(fact, title, storyLanguage, trackPool, artist)) continue;
    if (adjustedInterestScore(fact, narrator) < minScore) continue;
    if (isUsedFact(fact, usedFingerprints)) continue;
    const topic = classifyFactTopic(fact);
    if (topic !== 'misc' && blockedTopics.has(topic)) continue;
    if (factsTooSimilar(fact, previousScripts)) continue;
    if (factOverlapsPrevious(fact, previousScripts)) continue;
    return fact;
  }
  return null;
}

function wrapSelected(fact: string, scope: FactScope, narrator: StoryNarratorId = 'auto'): SelectedReferenceFact {
  const score = adjustedInterestScore(fact, narrator);
  return {
    fact,
    scope,
    scopeLabelRu: SCOPE_LABEL[scope],
    interestScore: score,
    interestRating: interestRating10(fact),
  };
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Иерархия: трек → альбом → артист.
 * Внутри scope — максимальный interestScore, не chart-trivia.
 * Никогда не возвращает факт с fingerprint из usedFingerprints (уже рассказан).
 */
export function pickReferenceFact(
  bundle: ReferenceFactBundle,
  previousScripts: string[],
  storyIndex = previousScripts.length,
  artist = '',
  title = '',
  usedFingerprints: Set<string> = new Set(),
  narrator: StoryNarratorId = 'auto',
  options: {
    blockedTopics?: Set<FactTopicKey>;
    recentScopes?: FactScope[];
    storyLanguage?: StoryLanguageId;
  } = {},
): SelectedReferenceFact | null {
  const pools = splitBundleByScope(bundle, artist, title);
  const blockedTopics = options.blockedTopics ?? new Set<FactTopicKey>();
  const storyLanguage = options.storyLanguage ?? 'ru';
  const scopeOrder = resolveScopeOrder(storyIndex, options.recentScopes ?? []);
  const trackPoolForReject = [...pools.track, ...pools.album];
  const trackScopeStreak = (options.recentScopes ?? []).slice(0, 2).filter((s) => s === 'track').length;
  const minGoodForScope = (scope: FactScope): number =>
    scope !== 'track' && trackScopeStreak >= 2 ? MIN_PICK_INTEREST_SCORE - 6 : MIN_GOOD_SCOPE_INTEREST;

  for (const scope of scopeOrder) {
    const pool = pools[scope];
    if (pool.length === 0) continue;
    const minScore = minGoodForScope(scope);
    const picked = pickBestByInterest(
      pool,
      previousScripts,
      usedFingerprints,
      minScore,
      title,
      narrator,
      blockedTopics,
      storyLanguage,
      trackPoolForReject,
      artist,
    );
    if (picked && adjustedInterestScore(picked, narrator) >= minScore) {
      return wrapSelected(picked, scope, narrator);
    }
  }

  const globalBest = pickBestByInterest(
    [...pools.track, ...pools.album, ...pools.artist],
    previousScripts,
    usedFingerprints,
    MIN_PICK_INTEREST_SCORE,
    title,
    narrator,
    blockedTopics,
    storyLanguage,
    trackPoolForReject,
    artist,
  );
  if (globalBest && !isRejectedSeed(globalBest, title, storyLanguage, trackPoolForReject, artist)) {
    if (!isCatalogMetadataSeed(globalBest) && !isCitationBibliographySeed(globalBest)) {
      const scope: FactScope = pools.track.includes(globalBest)
        ? 'track'
        : pools.album.includes(globalBest)
          ? 'album'
          : 'artist';
      return wrapSelected(globalBest, scope, narrator);
    }
  }

  const anyPool = [...pools.track, ...pools.album, ...pools.artist];
  for (const fact of sortByInterest(anyPool, narrator)) {
    if (isMetadataOnlyFallbackFact(fact)) continue;
    if (isMisattributedBandTrackFact(fact, title)) continue;
    if (isBoringFact(fact) && !(title && (isTrackTitleAnchoredSeed(fact, title) || factMentionsTitle(fact, title)))) continue;
    if (isRejectedSeed(fact, title, storyLanguage, trackPoolForReject, artist)) continue;
    if (adjustedInterestScore(fact, narrator) < 6) continue;
    if (isUsedFact(fact, usedFingerprints)) continue;
    const topic = classifyFactTopic(fact);
    if (topic !== 'misc' && blockedTopics.has(topic)) continue;
    if (factsTooSimilar(fact, previousScripts)) continue;
    if (!factOverlapsPrevious(fact, previousScripts)) {
      const scope: FactScope = pools.track.includes(fact)
        ? 'track'
        : pools.album.includes(fact)
          ? 'album'
          : 'artist';
      return wrapSelected(fact, scope, narrator);
    }
  }

  return null;
}

/** After duplicate-reject: pick next-best bundle fact, ignoring recent-topic similarity (only excluded fingerprints). */
export function pickFallbackSeedFromBundle(
  bundle: ReferenceFactBundle,
  artist: string,
  title: string,
  excludedFingerprints: Set<string>,
  narrator: StoryNarratorId = 'auto',
  storyLanguage: StoryLanguageId = 'ru',
): SelectedReferenceFact | null {
  const pools = splitBundleByScope(bundle, artist, title);
  const trackPoolForReject = [...pools.track, ...pools.album];
  const candidates = [...pools.track, ...pools.album, ...pools.artist].sort(
    (a, b) => adjustedInterestScore(b, narrator) - adjustedInterestScore(a, narrator),
  );
  for (const fact of candidates) {
    if (excludedFingerprints.has(factFingerprint(fact))) continue;
    if (isRejectedSeed(fact, title, storyLanguage, trackPoolForReject, artist)) continue;
    if (isEncyclopediaDefinitionSeed(fact)) continue;
    if (isGenericConcertVenueSeed(fact)) continue;
    if (adjustedInterestScore(fact, narrator) < MIN_PICK_INTEREST_SCORE) continue;
    const scope: FactScope = pools.track.includes(fact)
      ? 'track'
      : pools.album.includes(fact)
        ? 'album'
        : 'artist';
    return wrapSelected(fact, scope, narrator);
  }
  return null;
}

export function explainReferenceFactSelection(
  bundle: ReferenceFactBundle,
  selected: SelectedReferenceFact | null,
  artist = '',
  title = '',
): string {
  if (!selected) return 'No fact selected.';
  const pools = splitBundleByScope(bundle, artist, title);
  const scopePool =
    selected.scope === 'track'
      ? pools.track
      : selected.scope === 'album'
        ? pools.album
        : pools.artist;
  const fromPool = scopePool.some((fact) => normalize(fact) === normalize(selected.fact));
  const backstory = isBackstoryFact(selected.fact);
  const impact = selected.interestScore;
  const reasons: string[] = [];
  reasons.push(fromPool ? `scope=${selected.scope}` : `scope=${selected.scope} (fallback pool)`);
  reasons.push(`interestScore=${selected.interestScore}`);
  reasons.push(`interest=${selected.interestRating}/10`);
  if (backstory) reasons.push('backstory=true');
  if (!backstory) reasons.push('backstory=false');
  if (impact >= 18) reasons.push('strong=true');
  return reasons.join(', ');
}

export function mergeReferenceFacts(bundle: ReferenceFactBundle, max = 6): string[] {
  return dedupeFacts([...bundle.trackFacts, ...bundle.artistFacts]).slice(0, max);
}

/** Central seed gate — picker, salvage fallback, story.ts validatedPool. */
export function isRejectedStorySeed(
  fact: string,
  artist: string,
  title: string,
  trackPool: string[] = [],
  storyLanguage: StoryLanguageId = 'ru',
): boolean {
  return isRejectedSeed(fact, title, storyLanguage, trackPool, artist);
}

export { isAlbumScopeFact, factMentionsOtherTrackTitle };
