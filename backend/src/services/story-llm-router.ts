import type { GenerateStoryInput, StoryScript } from './groq.js';
import {
  generateStoryScript as generateGroqStory,
  hasGroqApiKey,
  isGroqRateLimitError,
} from './groq.js';
import {
  generateStoryScript as generateGeminiStory,
  hasGeminiApiKey,
  isGeminiStoryFailure,
} from './gemini.js';
import { hasLlmKeyForProvider, type LlmProviderId } from './llm-provider.js';

export interface StoryGenerationResult {
  story: StoryScript;
  llmUsed: LlmProviderId;
}

function isGeminiRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /\b429\b|resource_exhausted|quota exceeded/i.test(err.message);
}

/** Cross-provider fallback only on API rate limits — not quality rejects (saves Gemini quota). */
function shouldFallbackToAlternateProvider(err: unknown): boolean {
  if (isGroqRateLimitError(err)) return true;
  if (isGeminiRateLimitError(err)) return true;
  return false;
}

async function generateForProvider(
  provider: LlmProviderId,
  input: GenerateStoryInput,
): Promise<StoryScript> {
  return provider === 'gemini' ? generateGeminiStory(input) : generateGroqStory(input);
}

export async function generateStoryWithFallback(
  input: GenerateStoryInput,
  preferred: LlmProviderId,
): Promise<StoryGenerationResult> {
  if (!hasGroqApiKey() && !hasGeminiApiKey()) {
    throw new Error('No LLM API keys configured on server');
  }

  try {
    const story = await generateForProvider(preferred, input);
    console.log(`[story-llm] ok provider=${preferred}`);
    return { story, llmUsed: preferred };
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message.slice(0, 160) : String(primaryErr);
    console.warn(`[story-llm] provider ${preferred} failed: ${msg}`);

    if (!shouldFallbackToAlternateProvider(primaryErr)) {
      throw primaryErr;
    }

    const alternate: LlmProviderId = preferred === 'gemini' ? 'groq' : 'gemini';
    if (!hasLlmKeyForProvider(alternate)) {
      throw primaryErr;
    }

    console.warn(`[story-llm] rate limit on ${preferred} — trying ${alternate}`);
    const story = await generateForProvider(alternate, input);
    console.log(`[story-llm] ok provider=${alternate} (fallback)`);
    return { story, llmUsed: alternate };
  }
}

export function shouldFallbackProvider(err: unknown): boolean {
  return shouldFallbackToAlternateProvider(err);
}

// Keep export for tests / callers that checked gemini failures
export { isGeminiStoryFailure };
