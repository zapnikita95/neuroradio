import { hasGeminiApiKey } from './gemini.js';
import { hasGroqApiKey } from './groq.js';

export type LlmProviderId = 'groq' | 'gemini';

export function resolveLlmProvider(override?: unknown): LlmProviderId {
  const raw = typeof override === 'string' ? override.trim().toLowerCase() : '';
  if (raw === 'gemini' || raw === 'groq') return raw;
  const fromEnv = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (fromEnv === 'gemini' || fromEnv === 'groq') return fromEnv;
  if (hasGroqApiKey()) return 'groq';
  if (hasGeminiApiKey()) return 'gemini';
  return 'groq';
}

export function hasLlmKeyForProvider(provider: LlmProviderId): boolean {
  return provider === 'gemini' ? hasGeminiApiKey() : hasGroqApiKey();
}
