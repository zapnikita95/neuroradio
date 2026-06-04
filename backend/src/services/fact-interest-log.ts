import { interestScore } from './reference-fact-quality.js';
import type { SelectedReferenceFact } from './fact-picker.js';

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
  source: 'rules' | 'llm' | 'metadata' | 'none',
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
