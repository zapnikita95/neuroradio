/**
 * Second-pass LLM verification: is the extracted fact actually supported by the source text?
 * Runs after deep-search extract, before seed is accepted.
 */
import { callOpenAiChatCompletion } from './llm-openai-chat.js';
import { verifyQuoteInText } from './fact-scope-validator.js';

export interface DeepFactVerifyInput {
  artist: string;
  title: string;
  fact: string;
  scope: 'track' | 'album' | 'artist';
  evidenceUrl: string;
  evidenceQuote: string;
  pageText: string;
}

export interface DeepFactVerifyResult {
  verified: boolean;
  reason: string;
  /** Russian fact when verification passes (optional rewrite). */
  factRu?: string;
}

function parseVerifyJson(raw: string): DeepFactVerifyResult | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]) as {
      verified?: boolean;
      reason?: string;
      fact_ru?: string;
      reject?: boolean;
    };
    if (p.reject || p.verified === false) {
      return { verified: false, reason: p.reason ?? 'llm rejected' };
    }
    if (p.verified === true) {
      return {
        verified: true,
        reason: p.reason ?? 'ok',
        factRu: p.fact_ru?.trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifyDeepFactWithLlm(
  input: DeepFactVerifyInput,
  apiKey: string,
  model = 'deepseek/deepseek-chat-v3-0324',
): Promise<DeepFactVerifyResult> {
  if (!verifyQuoteInText(input.evidenceQuote, input.pageText)) {
    return { verified: false, reason: 'evidence_quote_not_in_source' };
  }

  const system = `Ты — факт-чекер музыкальных историй. Отвечай только JSON.
Проверь: (1) цитата evidence реально поддерживает fact; (2) fact про ЭТОТ трек, а не общую биографию группы;
(3) нет выдумки сверх текста источника.
Если fact на английском — добавь fact_ru: точный перевод на русский без домыслов.
Успех: {"verified":true,"reason":"...","fact_ru":"..."}
Отказ: {"verified":false,"reason":"..."}`;

  const user = `Артист: ${input.artist}
Трек: ${input.title}
Scope: ${input.scope}
URL: ${input.evidenceUrl}

FACT: ${input.fact}

EVIDENCE QUOTE: ${input.evidenceQuote}

SOURCE EXCERPT (800 chars):
${input.pageText.slice(0, 800)}`;

  try {
    const raw = await callOpenAiChatCompletion({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey,
      model,
      systemPrompt: system,
      userPrompt: user,
      maxTokens: 400,
      temperature: 0.2,
      extraHeaders: {
        'HTTP-Referer': 'https://efir-ai.ru',
        'X-Title': 'Music Story Fact Verify',
      },
      label: 'deep-fact-verify',
      timeoutMs: 35000,
    });
    const parsed = parseVerifyJson(raw);
    if (parsed) return parsed;
    return { verified: false, reason: 'verify_json_parse_fail' };
  } catch (err) {
    return {
      verified: false,
      reason: err instanceof Error ? err.message : 'verify_llm_error',
    };
  }
}
