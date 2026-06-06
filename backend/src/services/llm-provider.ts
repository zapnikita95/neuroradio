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

/** Story generation — OpenRouter only on server; Groq only with client key in advanced settings. */
export const STORY_LLM_FALLBACK_ORDER: LlmProviderId[] = ['openrouter'];

function isKnownProvider(raw: string): raw is LlmProviderId {
  return raw === 'openrouter' || raw === 'groq' || raw === 'gemini' || raw === 'local';
}

export function resolveLlmProvider(override?: unknown): LlmProviderId {
  const raw = typeof override === 'string' ? override.trim().toLowerCase() : '';
  if (isKnownProvider(raw)) return raw;
  const fromEnv = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (fromEnv && isKnownProvider(fromEnv)) return fromEnv;
  if (hasOpenRouterApiKey()) return 'openrouter';
  if (hasGroqApiKey()) return 'groq';
  if (hasGeminiApiKey()) return 'gemini';
  if (hasLocalOllamaConfigured()) return 'local';
  return 'openrouter';
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
 * Server-managed stories: OpenRouter model chain only (no server Groq).
 * Groq appears only when the user supplied their own key in advanced settings.
 */
export function alternateStoryLlmProviders(
  preferred: LlmProviderId,
  clientKeys?: ClientLlmKeys,
  clientLocal?: ClientLocalOllama,
  options: { serverManaged?: boolean } = {},
): LlmProviderId[] {
  if (options.serverManaged) return [];
  return STORY_LLM_FALLBACK_ORDER.filter(
    (p) =>
      p !== preferred &&
      (p !== 'groq' || Boolean(clientKeys?.groq?.trim())) &&
      hasLlmKeyForProvider(p, clientKeys, clientLocal),
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
