import { LIKE_REASONS } from './story-feedback.js';

export const TRIPLE_LIKE_REASONS = [...LIKE_REASONS] as const;

export function isTripleLikeReasonSet(reasons: readonly string[]): boolean {
  const set = new Set(reasons.map((r) => r.trim()).filter(Boolean));
  return TRIPLE_LIKE_REASONS.every((r) => set.has(r));
}

export function mergeLikeReasons(existing: readonly string[], incoming: readonly string[]): string[] {
  return [...new Set([...existing, ...incoming].map((r) => r.trim()).filter(Boolean))];
}
