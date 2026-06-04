import {
  factAppliesToRequest,
  factMentionsOtherTrackTitle,
  isAlbumScopeFact,
} from './fact-relevance.js';
import {
  filterAndRankFacts,
  interestScore,
  isBackstoryFact,
  isBoringFact,
  isCollectorFact,
  MIN_PICK_INTEREST_SCORE,
} from './reference-fact-quality.js';
import { highImpactBonus, WEAK_TRIVIA_PATTERNS } from './story-fact-hunt.js';
import { splitBundleByScope, type RankedFactScope } from './fact-ranking.js';

export type FactScope = RankedFactScope;

export interface ReferenceFactBundle {
  artistFacts: string[];
  trackFacts: string[];
}

export interface SelectedReferenceFact {
  fact: string;
  scope: FactScope;
  scopeLabelRu: string;
}

const SCOPE_LABEL: Record<FactScope, string> = {
  track: 'трек',
  album: 'альбом',
  artist: 'группа/артист',
};

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

function seedPriority(fact: string): number {
  if (/(?:Виктор\s+Цой|Цой|1987\s+год|композици\w*|запис\w*\s+альбом)/i.test(fact)) return 3;
  if (/\b(?:promo track under the name|originally released as a promo|withheld from release|banned by several radio|appeal to (?:a )?white|discrimination|heritage)\b/i.test(fact)) {
    return 3;
  }
  if (/\b(?:single cut is significantly shorter|album version featuring an introductory)\b/i.test(fact)) {
    return 1;
  }
  return 2;
}

function sortCandidates(facts: string[]): string[] {
  return [...facts].sort((a, b) => {
    const impact = highImpactBonus(b) - highImpactBonus(a);
    if (impact !== 0) return impact;
    const seed = seedPriority(b) - seedPriority(a);
    if (seed !== 0) return seed;
    return interestScore(b) - interestScore(a);
  });
}

function pickHighImpactFromPool(
  facts: string[],
  previousScripts: string[],
): string | null {
  for (const fact of sortCandidates(facts)) {
    if (WEAK_TRIVIA_PATTERNS.some((p) => p.test(fact))) continue;
    if (isBoringFact(fact)) continue;
    if (isCollectorFact(fact)) continue;
    if (interestScore(fact) < MIN_PICK_INTEREST_SCORE) continue;
    if (highImpactBonus(fact) < 6) continue;
    if (factOverlapsPrevious(fact, previousScripts)) continue;
    return fact;
  }
  return null;
}

function pickFromPool(
  facts: string[],
  previousScripts: string[],
): string | null {
  for (const fact of sortCandidates(facts)) {
    if (isBoringFact(fact)) continue;
    if (isCollectorFact(fact)) continue;
    if (interestScore(fact) < MIN_PICK_INTEREST_SCORE) continue;
    if (!factOverlapsPrevious(fact, previousScripts)) return fact;
  }
  return null;
}

function pickBackstoryFromPool(
  facts: string[],
  previousScripts: string[],
): string | null {
  for (const fact of facts) {
    if (!isBackstoryFact(fact)) continue;
    if (isBoringFact(fact)) continue;
    if (factOverlapsPrevious(fact, previousScripts)) continue;
    return fact;
  }
  return null;
}

function pickFromScopedPool(
  facts: string[],
  previousScripts: string[],
): string | null {
  return (
    pickHighImpactFromPool(facts, previousScripts) ??
    pickBackstoryFromPool(facts, previousScripts) ??
    pickFromPool(facts, previousScripts)
  );
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Иерархия: трек → альбом → группа/артист.
 * Чужие названия песен отсекаются.
 */
export function pickReferenceFact(
  bundle: ReferenceFactBundle,
  previousScripts: string[],
  storyIndex = previousScripts.length,
  artist = '',
  title = '',
): SelectedReferenceFact | null {
  const pools = splitBundleByScope(bundle, artist, title);

  // Чётные истории — можно взять артиста, если трек/альбом уже были в previousScripts
  const scopeOrder: FactScope[] =
    storyIndex % 2 === 1 ? ['artist', 'album', 'track'] : ['track', 'album', 'artist'];

  for (const scope of scopeOrder) {
    const pool = pools[scope];
    if (pool.length === 0) continue;
    const picked = pickFromScopedPool(pool, previousScripts);
    if (picked) {
      return {
        fact: picked,
        scope,
        scopeLabelRu: SCOPE_LABEL[scope],
      };
    }
  }

  const anyPool = [...pools.track, ...pools.album, ...pools.artist];
  for (const fact of anyPool) {
    if (isBoringFact(fact)) continue;
    if (!factOverlapsPrevious(fact, previousScripts)) {
      const scope: FactScope = pools.track.includes(fact)
        ? 'track'
        : pools.album.includes(fact)
          ? 'album'
          : 'artist';
      return { fact, scope, scopeLabelRu: SCOPE_LABEL[scope] };
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
  const impact = highImpactBonus(selected.fact);
  const score = interestScore(selected.fact);
  const reasons: string[] = [];
  reasons.push(fromPool ? `scope=${selected.scope}` : `scope=${selected.scope} (fallback pool)`);
  reasons.push(`interestScore=${score}`);
  if (backstory) reasons.push('backstory=true');
  if (!backstory) reasons.push('backstory=false');
  if (impact >= 6) reasons.push(`highImpact=${impact}`);
  return reasons.join(', ');
}

export function mergeReferenceFacts(bundle: ReferenceFactBundle, max = 6): string[] {
  return dedupeFacts([...bundle.trackFacts, ...bundle.artistFacts]).slice(0, max);
}

/** @deprecated internal — kept for tests importing scope helpers */
export { isAlbumScopeFact, factMentionsOtherTrackTitle };
