import { hasGeminiApiKey } from './gemini.js';
import { hasGroqApiKey } from './groq.js';
import { hasOpenRouterApiKey } from './openrouter.js';

export type LlmProviderId = 'openrouter' | 'groq' | 'gemini';

export interface ClientLlmKeys {
  groq?: string;
  gemini?: string;
  openrouter?: string;
}

export function clientKeyForProvider(
  provider: LlmProviderId,
  keys?: ClientLlmKeys,
): string | undefined {
  if (!keys) return undefined;
  if (provider === 'gemini') return keys.gemini?.trim() || undefined;
  if (provider === 'openrouter') return keys.openrouter?.trim() || undefined;
  return keys.groq?.trim() || undefined;
}

export const LLM_PROVIDER_ORDER: LlmProviderId[] = ['openrouter', 'groq', 'gemini'];

function isKnownProvider(raw: string): raw is LlmProviderId {
  return raw === 'openrouter' || raw === 'groq' || raw === 'gemini';
}

export function resolveLlmProvider(override?: unknown): LlmProviderId {
  const raw = typeof override === 'string' ? override.trim().toLowerCase() : '';
  if (isKnownProvider(raw)) return raw;
  const fromEnv = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (fromEnv && isKnownProvider(fromEnv)) return fromEnv;
  if (hasGroqApiKey()) return 'groq';
  if (hasGeminiApiKey()) return 'gemini';
  if (hasOpenRouterApiKey()) return 'openrouter';
  return 'groq';
}

export function hasLlmKeyForProvider(provider: LlmProviderId, clientKeys?: ClientLlmKeys): boolean {
  const client = clientKeyForProvider(provider, clientKeys);
  if (provider === 'gemini') return hasGeminiApiKey(client);
  if (provider === 'openrouter') return hasOpenRouterApiKey(client);
  return hasGroqApiKey(client);
}

export function alternateLlmProviders(
  preferred: LlmProviderId,
  clientKeys?: ClientLlmKeys,
): LlmProviderId[] {
  return LLM_PROVIDER_ORDER.filter(
    (p) => p !== preferred && hasLlmKeyForProvider(p, clientKeys),
  );
}
