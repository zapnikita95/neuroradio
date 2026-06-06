import { factFingerprint } from './fact-bank.js';
import {
  filterAndRankFacts,
  interestScore,
  isBackstoryFact,
  isBoringFact,
  isCollectorFact,
  isWeakChartSeed,
  MIN_PICK_INTEREST_SCORE,
} from './reference-fact-quality.js';
import { interestRating10 } from './fact-interest-log.js';
import { WEAK_TRIVIA_PATTERNS } from './story-fact-hunt.js';
import { isMetadataOnlyFallbackFact } from './metadata-facts.js';
import { isTruncatedMarketingSnippet, isUnspeakableWebSeed } from './web-snippet-accept.js';
import { splitBundleByScope, type RankedFactScope } from './fact-ranking.js';
import { isAlbumScopeFact, factMentionsOtherTrackTitle, isMisattributedBandTrackFact } from './fact-relevance.js';

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

function factOverlapsPrevious(fact: string, previousScripts: string[]): boolean {
  const factWords = significantWords(fact);
  if (factWords.length === 0) return false;

  for (const script of previousScripts) {
    const scriptWords = new Set(significantWords(script));
    const hits = factWords.filter((word) => scriptWords.has(word)).length;
    const threshold = Math.min(3, Math.max(2, Math.ceil(factWords.length * 0.45)));
    if (hits >= threshold) return true;
  }
  return false;
}

function isRejectedSeed(fact: string, title = ''): boolean {
  if (isMetadataOnlyFallbackFact(fact)) return true;
  if (title && isMisattributedBandTrackFact(fact, title)) return true;
  if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(fact))) return true;
  if (isWeakChartSeed(fact)) return true;
  if (isBoringFact(fact)) return true;
  if (isCollectorFact(fact)) return true;
  if (isTruncatedMarketingSnippet(fact)) return true;
  if (isUnspeakableWebSeed(fact)) return true;
  return false;
}

function sortByInterest(facts: string[]): string[] {
  return [...facts].sort((a, b) => interestScore(b) - interestScore(a));
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
): string | null {
  for (const fact of sortByInterest(facts)) {
    if (isRejectedSeed(fact, title)) continue;
    if (interestScore(fact) < minScore) continue;
    if (isUsedFact(fact, usedFingerprints)) continue;
    if (factOverlapsPrevious(fact, previousScripts)) continue;
    return fact;
  }
  return null;
}

function wrapSelected(fact: string, scope: FactScope): SelectedReferenceFact {
  const score = interestScore(fact);
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
): SelectedReferenceFact | null {
  const pools = splitBundleByScope(bundle, artist, title);

  const scopeOrder: FactScope[] =
    storyIndex % 2 === 1 ? ['artist', 'album', 'track'] : ['track', 'album', 'artist'];

  for (const scope of scopeOrder) {
    const pool = pools[scope];
    if (pool.length === 0) continue;
    const picked = pickBestByInterest(pool, previousScripts, usedFingerprints, MIN_PICK_INTEREST_SCORE, title);
    if (picked && interestScore(picked) >= MIN_GOOD_SCOPE_INTEREST) {
      return wrapSelected(picked, scope);
    }
  }

  const globalBest = pickBestByInterest(
    [...pools.track, ...pools.album, ...pools.artist],
    previousScripts,
    usedFingerprints,
    MIN_PICK_INTEREST_SCORE,
    title,
  );
  if (globalBest) {
    const scope: FactScope = pools.track.includes(globalBest)
      ? 'track'
      : pools.album.includes(globalBest)
        ? 'album'
        : 'artist';
    return wrapSelected(globalBest, scope);
  }

  const anyPool = [...pools.track, ...pools.album, ...pools.artist];
  for (const fact of sortByInterest(anyPool)) {
    if (isMetadataOnlyFallbackFact(fact)) continue;
    if (isMisattributedBandTrackFact(fact, title)) continue;
    if (isBoringFact(fact)) continue;
    if (isRejectedSeed(fact, title)) continue;
    if (interestScore(fact) < 6) continue;
    if (isUsedFact(fact, usedFingerprints)) continue;
    if (!factOverlapsPrevious(fact, previousScripts)) {
      const scope: FactScope = pools.track.includes(fact)
        ? 'track'
        : pools.album.includes(fact)
          ? 'album'
          : 'artist';
      return wrapSelected(fact, scope);
    }
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

export { isAlbumScopeFact, factMentionsOtherTrackTitle };
