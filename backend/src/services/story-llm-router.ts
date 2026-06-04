import type { GenerateStoryInput, StoryScript } from './groq.js';
import {
  generateStoryScript as generateGroqStory,
  hasGroqApiKey,
} from './groq.js';
import {
  generateStoryScript as generateGeminiStory,
  hasGeminiApiKey,
  isGeminiStoryFailure,
} from './gemini.js';
import {
  generateStoryScript as generateOpenRouterStory,
  hasOpenRouterApiKey,
} from './openrouter.js';
import { generateStoryScriptLocal } from './local-ollama-story.js';
import {
  alternateLlmProviders,
  hasLlmKeyForProvider,
  type LlmProviderId,
} from './llm-provider.js';

export interface StoryGenerationResult {
  story: StoryScript;
  llmUsed: LlmProviderId;
}

async function generateForProvider(
  provider: LlmProviderId,
  input: GenerateStoryInput,
): Promise<StoryScript> {
  if (provider === 'local') return generateStoryScriptLocal(input);
  if (provider === 'gemini') return generateGeminiStory(input);
  if (provider === 'openrouter') return generateOpenRouterStory(input);
  return generateGroqStory(input);
}

function inputForProvider(
  input: GenerateStoryInput,
  provider: LlmProviderId,
  isFallback: boolean,
): GenerateStoryInput {
  if (!isFallback) return input;
  // On fallback use Railway server keys — client's exhausted Groq/OpenRouter must not block retry.
  return {
    ...input,
    clientGroqApiKey: provider === 'groq' ? undefined : input.clientGroqApiKey,
    clientGeminiApiKey: provider === 'gemini' ? undefined : input.clientGeminiApiKey,
    clientOpenRouterApiKey: provider === 'openrouter' ? undefined : input.clientOpenRouterApiKey,
  };
}

export async function generateStoryWithFallback(
  input: GenerateStoryInput,
  preferred: LlmProviderId,
): Promise<StoryGenerationResult> {
  const clientKeys = {
    groq: input.clientGroqApiKey,
    gemini: input.clientGeminiApiKey,
    openrouter: input.clientOpenRouterApiKey,
  };
  const clientLocal = {
    baseUrl: input.localOllamaBaseUrl,
    model: input.localOllamaModel,
  };
  const chain = [
    preferred,
    ...alternateLlmProviders(preferred, clientKeys, clientLocal),
  ].filter((provider) => hasLlmKeyForProvider(provider, clientKeys, clientLocal));

  if (chain.length === 0) {
    throw new Error('No LLM API keys configured on server');
  }

  let lastError: unknown;
  let lastQualityError: Error | undefined;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i]!;
    const isFallback = i > 0;
    try {
      const story = await generateForProvider(provider, inputForProvider(input, provider, isFallback));
      if (isFallback) {
        console.warn(`[story-llm] ok provider=${provider} (fallback after ${preferred})`);
      } else {
        console.log(`[story-llm] ok provider=${provider}`);
      }
      return { story, llmUsed: provider };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/could not produce a usable story/i.test(msg)) {
        lastQualityError = err instanceof Error ? err : new Error(msg);
      }
      console.warn(`[story-llm] provider=${provider} failed: ${msg.slice(0, 200)}`);
    }
  }

  throw lastQualityError ?? (lastError instanceof Error ? lastError : new Error('All LLM providers failed'));
}

export { isGeminiStoryFailure, hasGroqApiKey, hasGeminiApiKey, hasOpenRouterApiKey };
