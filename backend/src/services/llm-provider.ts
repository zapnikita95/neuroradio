import { hasGeminiApiKey } from './gemini.js';
import { hasGroqApiKey } from './groq.js';
import { hasOpenRouterApiKey } from './openrouter.js';

export type LlmProviderId = 'openrouter' | 'groq' | 'gemini';

export const LLM_PROVIDER_ORDER: LlmProviderId[] = ['openrouter', 'groq', 'gemini'];

function isKnownProvider(raw: string): raw is LlmProviderId {
  return raw === 'openrouter' || raw === 'groq' || raw === 'gemini';
}

export function resolveLlmProvider(override?: unknown): LlmProviderId {
  const raw = typeof override === 'string' ? override.trim().toLowerCase() : '';
  if (isKnownProvider(raw)) return raw;
  const fromEnv = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (fromEnv && isKnownProvider(fromEnv)) return fromEnv;
  if (hasOpenRouterApiKey()) return 'openrouter';
  if (hasGroqApiKey()) return 'groq';
  if (hasGeminiApiKey()) return 'gemini';
  return 'openrouter';
}

export function hasLlmKeyForProvider(provider: LlmProviderId): boolean {
  if (provider === 'gemini') return hasGeminiApiKey();
  if (provider === 'openrouter') return hasOpenRouterApiKey();
  return hasGroqApiKey();
}

export function alternateLlmProviders(preferred: LlmProviderId): LlmProviderId[] {
  return LLM_PROVIDER_ORDER.filter((p) => p !== preferred && hasLlmKeyForProvider(p));
}
