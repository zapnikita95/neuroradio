/** Groq chat models — try in order on 429 / overload. */

/** Primary: 70B quality; 8b-instant only when 70B rate-limited. */
export const GROQ_STORY_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
] as const;

export type GroqModelId = (typeof GROQ_STORY_MODELS)[number];

export function resolveGroqModelOrder(preferred?: string): string[] {
  const env = process.env.GROQ_MODEL?.trim();
  const first = preferred?.trim() || env || GROQ_STORY_MODELS[0];
  const ordered = [first, ...GROQ_STORY_MODELS, env].filter(Boolean) as string[];
  return [...new Set(ordered)];
}
