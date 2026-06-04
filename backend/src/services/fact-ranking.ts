import { factAppliesToRequest, factMentionsOtherTrackTitle, factMentionsTitle, isAlbumScopeFact } from './fact-relevance.js';
import type { ReferenceFactBundle } from './fact-picker.js';
import {
  filterAndRankFacts,
  interestScore,
  isBoringFact,
  isCollectorFact,
} from './reference-fact-quality.js';
import { highImpactBonus, WEAK_TRIVIA_PATTERNS } from './story-fact-hunt.js';

export type RankedFactScope = 'track' | 'album' | 'artist';

export interface RankedFact {
  fact: string;
  scope: RankedFactScope;
  interest: number;
  impact: number;
  junk: boolean;
}

export interface ScopedFactPools {
  track: string[];
  album: string[];
  artist: string[];
}

function isJunk(fact: string): boolean {
  return (
    WEAK_TRIVIA_PATTERNS.some((p) => p.test(fact)) ||
    isBoringFact(fact) ||
    isCollectorFact(fact)
  );
}

export function splitBundleByScope(
  bundle: ReferenceFactBundle,
  artist: string,
  title: string,
): ScopedFactPools {
  const track: string[] = [];
  const album: string[] = [];
  const artistFacts: string[] = [];

  for (const fact of filterAndRankFacts(bundle.trackFacts, 20)) {
    if (!factAppliesToRequest(fact, artist, title, 'track')) continue;
    if (factMentionsOtherTrackTitle(fact, title)) continue;
    if (isAlbumScopeFact(fact, title)) album.push(fact);
    else track.push(fact);
  }

  for (const fact of filterAndRankFacts(bundle.artistFacts, 20)) {
    if (!factAppliesToRequest(fact, artist, title, 'artist')) continue;
    if (factMentionsOtherTrackTitle(fact, title)) continue;
    if (!factMentionsTitle(fact, title) && /\b(?:did not chart|withheld from release|banned by several radio)\b/i.test(fact)) {
      continue;
    }
    artistFacts.push(fact);
  }

  return { track, album, artist: artistFacts };
}

export function rankScopedFacts(pools: ScopedFactPools): RankedFact[] {
  const out: RankedFact[] = [];
  for (const scope of ['track', 'album', 'artist'] as const) {
    for (const fact of pools[scope]) {
      out.push({
        fact,
        scope,
        interest: interestScore(fact),
        impact: highImpactBonus(fact),
        junk: isJunk(fact),
      });
    }
  }
  return out.sort((a, b) => {
    const scopeOrder = { track: 3, album: 2, artist: 1 };
    const scopeDiff = scopeOrder[b.scope] - scopeOrder[a.scope];
    if (scopeDiff !== 0 && a.interest >= 6 && b.interest >= 6) {
      // Within good facts, scope wins
    }
    if (a.junk !== b.junk) return a.junk ? 1 : -1;
    const impact = b.impact - a.impact;
    if (impact !== 0) return impact;
    const scopePri = scopeOrder[b.scope] - scopeOrder[a.scope];
    if (scopePri !== 0) return scopePri;
    return b.interest - a.interest;
  });
}
