import type { UserTier } from './entitlements.js';
import { hasGeminiApiKey } from './gemini.js';
import { hasGroqApiKey } from './groq.js';
import { hasOpenRouterApiKey } from './openrouter.js';
import { hasLocalOllamaConfigured } from './local-ollama.js';

export type LlmProviderId = 'openrouter' | 'groq' | 'gemini' | 'local';

export interface ClientLlmKeys {
  groq?: string;
  gemini?: string;
  openrouter?: string;
}

export interface ClientLocalOllama {
  baseUrl?: string;
  model?: string;
}

export function clientKeyForProvider(
  provider: LlmProviderId,
  keys?: ClientLlmKeys,
): string | undefined {
  if (!keys) return undefined;
  if (provider === 'gemini') return keys.gemini?.trim() || undefined;
  if (provider === 'openrouter') return keys.openrouter?.trim() || undefined;
  if (provider === 'local') return undefined;
  return keys.groq?.trim() || undefined;
}

export const LLM_PROVIDER_ORDER: LlmProviderId[] = ['openrouter', 'groq', 'gemini', 'local'];

function isKnownProvider(raw: string): raw is LlmProviderId {
  return raw === 'openrouter' || raw === 'groq' || raw === 'gemini' || raw === 'local';
}

export function resolveLlmProvider(override?: unknown): LlmProviderId {
  const raw = typeof override === 'string' ? override.trim().toLowerCase() : '';
  if (isKnownProvider(raw)) return raw;
  const fromEnv = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (fromEnv && isKnownProvider(fromEnv)) return fromEnv;
  if (hasGroqApiKey()) return 'groq';
  if (hasGeminiApiKey()) return 'gemini';
  if (hasOpenRouterApiKey()) return 'openrouter';
  if (hasLocalOllamaConfigured()) return 'local';
  return 'groq';
}

export function hasLlmKeyForProvider(
  provider: LlmProviderId,
  clientKeys?: ClientLlmKeys,
  clientLocal?: ClientLocalOllama,
): boolean {
  if (provider === 'local') {
    return hasLocalOllamaConfigured(clientLocal?.baseUrl);
  }
  const client = clientKeyForProvider(provider, clientKeys);
  if (provider === 'gemini') return hasGeminiApiKey(client);
  if (provider === 'openrouter') return hasOpenRouterApiKey(client);
  return hasGroqApiKey(client);
}

export function alternateLlmProviders(
  preferred: LlmProviderId,
  clientKeys?: ClientLlmKeys,
  clientLocal?: ClientLocalOllama,
): LlmProviderId[] {
  return LLM_PROVIDER_ORDER.filter(
    (p) => p !== preferred && hasLlmKeyForProvider(p, clientKeys, clientLocal),
  );
}

/**
 * Free/trial users without their own API key use server OpenRouter — not Groq from the app default.
 */
export function resolveEffectiveStoryLlmProvider(
  tier: UserTier,
  requested: string | undefined,
  clientKeys?: ClientLlmKeys,
): LlmProviderId {
  const requestedProvider = resolveLlmProvider(requested);
  const ownKey = Boolean(clientKeyForProvider(requestedProvider, clientKeys));
  if ((tier === 'free' || tier === 'trial') && !ownKey && hasOpenRouterApiKey()) {
    return 'openrouter';
  }
  return requestedProvider;
}
