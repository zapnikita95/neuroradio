import {
  filterAndRankFacts,
  interestScore,
  isBackstoryFact,
  isBoringFact,
  MIN_PICK_INTEREST_SCORE,
} from './reference-fact-quality.js';

export type FactScope = 'artist' | 'track';

export interface ReferenceFactBundle {
  artistFacts: string[];
  trackFacts: string[];
}

export interface SelectedReferenceFact {
  fact: string;
  scope: FactScope;
  scopeLabelRu: string;
}

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

function pickFromPool(
  facts: string[],
  previousScripts: string[],
): string | null {
  for (const fact of facts) {
    if (isBoringFact(fact)) continue;
    if (interestScore(fact) < MIN_PICK_INTEREST_SCORE) continue;
    if (!factOverlapsPrevious(fact, previousScripts)) return fact;
  }
  return null;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
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

/**
 * Alternate track vs artist facts; skip ones already covered in previous scripts.
 */
export function pickReferenceFact(
  bundle: ReferenceFactBundle,
  previousScripts: string[],
  storyIndex = previousScripts.length,
): SelectedReferenceFact | null {
  const trackFacts = dedupeFacts(bundle.trackFacts);
  const artistFacts = dedupeFacts(bundle.artistFacts);
  const preferTrack = storyIndex % 2 === 0;

  const primary = preferTrack ? trackFacts : artistFacts;
  const fallback = preferTrack ? artistFacts : trackFacts;
  const primaryScope: FactScope = preferTrack ? 'track' : 'artist';
  const fallbackScope: FactScope = preferTrack ? 'artist' : 'track';

  // 0) First try a soulful/human backstory fact for better narrative quality.
  const backstoryPrimary = pickBackstoryFromPool(primary, previousScripts);
  if (backstoryPrimary) {
    return {
      fact: backstoryPrimary,
      scope: primaryScope,
      scopeLabelRu: primaryScope === 'track' ? 'трек' : 'группа/артист',
    };
  }
  const backstoryFallback = pickBackstoryFromPool(fallback, previousScripts);
  if (backstoryFallback) {
    return {
      fact: backstoryFallback,
      scope: fallbackScope,
      scopeLabelRu: fallbackScope === 'track' ? 'трек' : 'группа/артист',
    };
  }

  const primaryPick = pickFromPool(primary, previousScripts);
  if (primaryPick) {
    return {
      fact: primaryPick,
      scope: primaryScope,
      scopeLabelRu: primaryScope === 'track' ? 'трек' : 'группа/артист',
    };
  }

  const fallbackPick = pickFromPool(fallback, previousScripts);
  if (fallbackPick) {
    return {
      fact: fallbackPick,
      scope: fallbackScope,
      scopeLabelRu: fallbackScope === 'track' ? 'трек' : 'группа/артист',
    };
  }

  const anyPool = [...primary, ...fallback];
  for (const fact of anyPool) {
    if (isBoringFact(fact)) continue;
    if (!factOverlapsPrevious(fact, previousScripts)) {
      const scope = primary.includes(fact) ? primaryScope : fallbackScope;
      return {
        fact,
        scope,
        scopeLabelRu: scope === 'track' ? 'трек' : 'группа/артист',
      };
    }
  }

  return null;
}

/**
 * Debug helper: explain why a specific fact was selected.
 * Used for docs/logging and future audits.
 */
export function explainReferenceFactSelection(
  bundle: ReferenceFactBundle,
  selected: SelectedReferenceFact | null,
): string {
  if (!selected) return 'No fact selected.';
  const trackPool = dedupeFacts(bundle.trackFacts);
  const artistPool = dedupeFacts(bundle.artistFacts);
  const scopePool = selected.scope === 'track' ? trackPool : artistPool;
  const fromPool = scopePool.some((fact) => normalize(fact) === normalize(selected.fact));
  const backstory = isBackstoryFact(selected.fact);
  const score = interestScore(selected.fact);
  const reasons: string[] = [];
  reasons.push(fromPool ? `scope=${selected.scope}` : `scope=${selected.scope} (fallback pool)`);
  reasons.push(`interestScore=${score}`);
  if (backstory) reasons.push('backstory=true');
  if (!backstory) reasons.push('backstory=false');
  return reasons.join(', ');
}

export function mergeReferenceFacts(bundle: ReferenceFactBundle, max = 6): string[] {
  return dedupeFacts([...bundle.trackFacts, ...bundle.artistFacts]).slice(0, max);
}
