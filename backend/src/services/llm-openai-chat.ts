/**
 * OpenAI-compatible chat completions (Groq, OpenRouter).
 */

export class OpenAiChatError extends Error {
  readonly status: number;
  readonly bodySnippet: string;
  readonly retryable: boolean;

  constructor(status: number, bodySnippet: string, label = 'LLM') {
    super(`${label} API error ${status}: ${bodySnippet}`);
    this.name = 'OpenAiChatError';
    this.status = status;
    this.bodySnippet = bodySnippet;
    this.retryable = status === 429 || status >= 500;
  }
}

function extractFailedGeneration(errorBody: string): string | null {
  try {
    const root = JSON.parse(errorBody) as { error?: { failed_generation?: string } };
    return root.error?.failed_generation?.trim() || null;
  } catch {
    return null;
  }
}

export async function callOpenAiChatCompletion(params: {
  url: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
  useJsonMode?: boolean;
  extraHeaders?: Record<string, string>;
  label?: string;
  timeoutMs?: number;
}): Promise<string> {
  const {
    url,
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    maxTokens,
    temperature = 0.45,
    useJsonMode = true,
    extraHeaders = {},
    label = 'LLM',
    timeoutMs = 45000,
  } = params;

  const body: Record<string, unknown> = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (useJsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    if (useJsonMode && response.status === 400 && rawBody.includes('json_validate_failed')) {
      const recovered = extractFailedGeneration(rawBody);
      if (recovered) return recovered;
      return callOpenAiChatCompletion({ ...params, useJsonMode: false });
    }
    throw new OpenAiChatError(response.status, rawBody.slice(0, 400), label);
  }

  const data = JSON.parse(rawBody) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${label} returned empty content`);
  return content;
}
