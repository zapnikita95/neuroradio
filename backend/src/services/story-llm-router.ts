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
  hasLlmKeyForProvider,
  LLM_PROVIDER_ORDER,
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
  if (!LLM_PROVIDER_ORDER.some((p) => hasLlmKeyForProvider(p, clientKeys, clientLocal))) {
    throw new Error('No LLM API keys configured on server');
  }

  const story = await generateForProvider(preferred, input);
  console.log(`[story-llm] ok provider=${preferred}`);
  return { story, llmUsed: preferred };
}

export { isGeminiStoryFailure, hasGroqApiKey, hasGeminiApiKey, hasOpenRouterApiKey };
