import {
  factAppliesToRequest,
  factMentionsOtherTrackTitle,
  factMentionsTitle,
  isAlbumPrimaryContextFact,
  isAlbumScopeFact,
} from './fact-relevance.js';
import type { ReferenceFactBundle } from './fact-picker.js';
import {
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

function splitPoolsWithMode(
  bundle: ReferenceFactBundle,
  artist: string,
  title: string,
  mode: 'strict' | 'indie',
): ScopedFactPools {
  const track: string[] = [];
  const album: string[] = [];
  const artistFacts: string[] = [];

  for (const fact of bundle.trackFacts) {
    const trimmed = fact.trim();
    if (trimmed.length < 35) continue;
    if (!factAppliesToRequest(trimmed, artist, title, 'track', mode)) continue;
    if (factMentionsOtherTrackTitle(trimmed, title)) continue;
    if (isAlbumScopeFact(trimmed, title) || isAlbumPrimaryContextFact(trimmed)) album.push(trimmed);
    else track.push(trimmed);
  }

  for (const fact of bundle.artistFacts) {
    const trimmed = fact.trim();
    if (trimmed.length < 35) continue;
    if (/creativecommons|user-contributed text is available/i.test(trimmed)) continue;
    if (factMentionsOtherTrackTitle(trimmed, title)) continue;
    if (!factMentionsTitle(trimmed, title) && /\b(?:did not chart|withheld from release|banned by several radio)\b/i.test(trimmed)) {
      continue;
    }
    if (factAppliesToRequest(trimmed, artist, title, 'artist', mode)) {
      artistFacts.push(trimmed);
      continue;
    }
    if (
      mode === 'indie' &&
      /\b(?:deathtronica|electronicore|metalcore|hardcore|scream\s+vocals?)\b/i.test(trimmed)
    ) {
      artistFacts.push(trimmed);
    }
  }

  return { track, album, artist: artistFacts };
}

export function splitBundleByScope(
  bundle: ReferenceFactBundle,
  artist: string,
  title: string,
): ScopedFactPools {
  const strict = splitPoolsWithMode(bundle, artist, title, 'strict');
  const indie = splitPoolsWithMode(bundle, artist, title, 'indie');
  const artistMerged = [...new Set([...strict.artist, ...indie.artist])];
  const merged: ScopedFactPools = {
    track: strict.track.length > 0 ? strict.track : indie.track,
    album: strict.album.length > 0 ? strict.album : indie.album,
    artist: artistMerged,
  };
  if (merged.track.length + merged.album.length + merged.artist.length > 0) {
    return merged;
  }
  return strict;
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
  const scopeOrder = { track: 3, album: 2, artist: 1 };
  return out.sort((a, b) => {
    if (a.junk !== b.junk) return a.junk ? 1 : -1;
    const interest = b.interest - a.interest;
    if (interest !== 0) return interest;
    return scopeOrder[b.scope] - scopeOrder[a.scope];
  });
}
