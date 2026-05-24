import type { GenerateStoryInput, StoryScript } from './groq.js';
import {
  generateStoryScript as generateGroqStory,
  hasGroqApiKey,
  isGroqStoryFailure,
} from './groq.js';
import {
  generateStoryScript as generateGeminiStory,
  hasGeminiApiKey,
  isGeminiStoryFailure,
} from './gemini.js';
import type { LlmProviderId } from './llm-provider.js';

export interface StoryGenerationResult {
  story: StoryScript;
  llmUsed: LlmProviderId;
}

/** Try preferred LLM, then the other provider; each provider rotates its own models. */
export async function generateStoryWithFallback(
  input: GenerateStoryInput,
  preferred: LlmProviderId,
): Promise<StoryGenerationResult> {
  const chain: LlmProviderId[] =
    preferred === 'gemini' ? ['gemini', 'groq'] : ['groq', 'gemini'];

  const available = chain.filter((p) => (p === 'groq' ? hasGroqApiKey() : hasGeminiApiKey()));
  if (available.length === 0) {
    throw new Error('No LLM API keys configured on server');
  }

  let lastError: unknown;

  for (const provider of available) {
    try {
      const story =
        provider === 'gemini'
          ? await generateGeminiStory(input)
          : await generateGroqStory(input);
      console.log(`[story-llm] ok provider=${provider}`);
      return { story, llmUsed: provider };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message.slice(0, 160) : String(err);
      console.warn(`[story-llm] provider ${provider} failed: ${msg}`);
    }
  }

  throw lastError;
}

export function shouldFallbackProvider(err: unknown): boolean {
  return isGroqStoryFailure(err) || isGeminiStoryFailure(err);
}
