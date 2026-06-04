import { interestScore } from './reference-fact-quality.js';
import type { SelectedReferenceFact } from './fact-picker.js';
import type { ReferenceFactBundle } from './fact-picker.js';
import { splitBundleByScope } from './fact-ranking.js';

/** 1–10 для логов и UI — из interestScore без хардкода треков. */
export function interestRating10(fact: string): number {
  const raw = interestScore(fact);
  if (raw >= 28) return 10;
  if (raw >= 22) return 9;
  if (raw >= 18) return 8;
  if (raw >= 14) return 7;
  if (raw >= 10) return 6;
  if (raw >= 7) return 5;
  if (raw >= 4) return 4;
  return Math.max(1, Math.min(3, Math.round(raw / 2)));
}

export function formatFactPickLog(
  selected: SelectedReferenceFact | null,
  source: 'rules' | 'llm' | 'metadata' | 'bank' | 'none',
): string {
  if (!selected) {
    return '[facts] seed=NONE source=none interestScore=0 interest=0/10';
  }
  const score = interestScore(selected.fact);
  const rating = interestRating10(selected.fact);
  const preview = selected.fact.replace(/\s+/g, ' ').slice(0, 120);
  return (
    `[facts] seed source=${source} scope=${selected.scope} ` +
    `interestScore=${score} interest=${rating}/10 ` +
    `fact="${preview}${selected.fact.length > 120 ? '…' : ''}"`
  );
}

/** Log ranked fact pools so Railway logs show score/interest for every candidate, not only the pick. */
export function logFactCandidatePools(
  bundle: ReferenceFactBundle,
  artist: string,
  title: string,
): void {
  const pools = splitBundleByScope(bundle, artist, title);
  for (const scope of ['track', 'album', 'artist'] as const) {
    const facts = pools[scope];
    if (facts.length === 0) {
      console.log(`[facts] pool scope=${scope} count=0`);
      continue;
    }
    console.log(`[facts] pool scope=${scope} count=${facts.length}:`);
    for (let i = 0; i < Math.min(6, facts.length); i++) {
      const fact = facts[i]!;
      const score = interestScore(fact);
      const rating = interestRating10(fact);
      const preview = fact.replace(/\s+/g, ' ').slice(0, 85);
      console.log(
        `[facts]   ${i + 1}. score=${score} interest=${rating}/10 ` +
          `"${preview}${fact.length > 85 ? '…' : ''}"`,
      );
    }
  }
}
