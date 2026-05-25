/** Groq chat models — try in order on 429 / overload. */

/** Primary: 70B; then 8B; then GPT-OSS 20B (separate RPM bucket). */
export const GROQ_STORY_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
] as const;

/** Removed from Groq — must never be sent. */
export const GROQ_DECOMMISSIONED_MODELS = new Set([
  'gemma2-9b-it',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
  'llama-3.2-1b-preview',
  'llama-3.2-3b-preview',
]);

export type GroqModelId = (typeof GROQ_STORY_MODELS)[number];

export function resolveGroqModelOrder(preferred?: string): string[] {
  const env = process.env.GROQ_MODEL?.trim();
  const first = preferred?.trim() || env || GROQ_STORY_MODELS[0];
  const ordered = [first, ...GROQ_STORY_MODELS, env].filter(Boolean) as string[];
  return [...new Set(ordered)].filter((id) => !GROQ_DECOMMISSIONED_MODELS.has(id));
}
