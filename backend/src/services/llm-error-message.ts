import type { LlmProviderId } from './llm-provider.js';

export interface LlmErrorClassification {
  code: string;
  message: string;
  httpStatus: number;
}

/** User-facing text — do not blame daily Gemini quota when it is RPM or model tier. */
export function classifyStoryLlmError(
  err: unknown,
  llmProvider: LlmProviderId,
): LlmErrorClassification {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number }).status;
  const lower = rawMessage.toLowerCase();
  const label =
    llmProvider === 'gemini'
      ? 'Gemini'
      : llmProvider === 'openrouter'
        ? 'OpenRouter'
        : llmProvider === 'local'
          ? 'Ollama'
          : 'Groq';

  if (/invalid_api_key|invalid api key|\b401\b.*invalid/i.test(lower)) {
    const code =
      llmProvider === 'gemini'
        ? 'GEMINI_INVALID_KEY'
        : llmProvider === 'openrouter'
          ? 'OPENROUTER_INVALID_KEY'
          : 'GROQ_INVALID_KEY';
    return {
      code,
      message: `${label} API-ключ на сервере недействителен.`,
      httpStatus: 503,
    };
  }

  if (
    lower.includes('user location is not supported') ||
    lower.includes('location is not supported')
  ) {
    return {
      code: 'GEMINI_REGION',
      message:
        'Gemini с сервера Railway недоступен из региона дата-центра. Добавь свой Gemini-ключ в приложении — запрос пойдёт с телефона.',
      httpStatus: 503,
    };
  }

  if (/limit:\s*0|quotavalue["\s:]*0/i.test(lower)) {
    return {
      code: 'GEMINI_MODEL_UNAVAILABLE',
      message:
        'Google не выдал бесплатную квоту для выбранной модели Gemini. Выберите Gemini 2.0 Flash-Lite в настройках или попробуйте Groq.',
      httpStatus: 503,
    };
  }

  const isRateLimit =
    status === 429 ||
    /\b429\b/.test(rawMessage) ||
    /rate_limit_exceeded|resource_exhausted/i.test(lower);

  if (/model_decommissioned|has been decommissioned/i.test(lower)) {
    return {
      code: 'GROQ_MODEL_UNAVAILABLE',
      message:
        'На сервере устарела запасная модель Groq — обнови backend (убран gemma2). Подожди минуту и попробуй снова.',
      httpStatus: 503,
    };
  }

  if (isRateLimit) {
    const code =
      llmProvider === 'gemini'
        ? 'GEMINI_RATE_LIMIT'
        : llmProvider === 'openrouter'
          ? 'OPENROUTER_RATE_LIMIT'
          : 'GROQ_RATE_LIMIT';
    const upstreamFree =
      llmProvider === 'openrouter' &&
      /temporarily rate-limited upstream|rate-limited upstream/i.test(lower);
    const apiSnippet = extractLlmApiSnippet(rawMessage);
    const dailyLimit = /free-models-per-day|free model requests per day|tokens per day|per day| tpd/i.test(
      lower,
    );
    return {
      code,
      message: upstreamFree
        ? 'Бесплатные модели OpenRouter сейчас перегружены — подожди 1–2 минуты и попробуй снова, или добавь свой ключ OpenRouter в настройках.'
        : dailyLimit
          ? `${label} (дневной лимит): ${apiSnippet}`
          : `${label}: ${apiSnippet}`,
      httpStatus: 503,
    };
  }

  if (/ollama error|local ollama/i.test(lower)) {
    return {
      code: 'LOCAL_OLLAMA_FAILED',
      message:
        'Локальный Ollama недоступен. Проверь ZeroTier, что Ollama слушает на 11435 и URL в настройках (http://10.196.221.190:11435).',
      httpStatus: 503,
    };
  }

  if (/econnrefused|127\.0\.0\.1:11435|fetch failed/i.test(lower)) {
    return {
      code: 'STORY_QUALITY_REJECTED',
      message: 'Не получилось собрать историю — нажми «Рассказать историю» ещё раз.',
      httpStatus: 503,
    };
  }

  const llmUnavailable =
    /groq api error|gemini api error|openrouter api error|groq http|gemini http|openrouter http/i.test(
      lower,
    ) ||
    status === 403;

  if (llmUnavailable) {
    const code =
      llmProvider === 'gemini'
        ? 'GEMINI_FAILED'
        : llmProvider === 'openrouter'
          ? 'OPENROUTER_FAILED'
          : 'GROQ_FAILED';
    return {
      code,
      message: `${label} не ответил — попробуй через минуту или свой ключ в настройках.`,
      httpStatus: 503,
    };
  }

  if (/no reference facts/i.test(lower)) {
    return {
      code: 'NO_REFERENCE_FACTS',
      message:
        'Не нашли проверенных фактов про этот трек — история не сгенерирована, чтобы не выдумывать. Попробуй через минуту.',
      httpStatus: 503,
    };
  }

  if (/could not produce a usable story/i.test(lower)) {
    return {
      code: 'STORY_QUALITY_REJECTED',
      message: 'Не получилось собрать историю — нажми «Рассказать историю» ещё раз.',
      httpStatus: 500,
    };
  }

  if (/yandex tts|speechkit|tts\.api\.cloud\.yandex/i.test(lower)) {
    if (
      /speed|tempo|rate/i.test(lower) &&
      (/error 400|invalid|unsupported|bad request/i.test(lower) ||
        /yandex tts error 400/i.test(lower))
    ) {
      return {
        code: 'YANDEX_TTS_SPEED',
        message:
          'Yandex не принял скорость озвучки — попробуй «Быстро» или «Нормально» в настройках голоса.',
        httpStatus: 503,
      };
    }
    return {
      code: 'YANDEX_TTS_FAILED',
      message:
        'Yandex не смог озвучить историю на сервере. Подожди минуту и попробуй снова.',
      httpStatus: 503,
    };
  }

  if (/could not produce a story grounded in reference facts/i.test(lower)) {
    return {
      code: 'STORY_QUALITY_FAILED',
      message:
        'Не удалось собрать историю по этому факту. Попробуй ещё раз через минуту — возьмём другой угол.',
      httpStatus: 503,
    };
  }

  return {
    code: 'STORY_FAILED',
    message: 'Не удалось сгенерировать историю. Попробуй ещё раз.',
    httpStatus: 500,
  };
}

function extractLlmApiSnippet(rawMessage: string): string {
  const jsonMatch = rawMessage.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (jsonMatch?.[1]) {
    return jsonMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').slice(0, 220);
  }
  const afterColon = rawMessage.match(/(?:API error \d+:\s*)([\s\S]+)/i);
  if (afterColon?.[1]) {
    try {
      const parsed = JSON.parse(afterColon[1]) as { error?: { message?: string } };
      const msg = parsed.error?.message?.trim();
      if (msg) return msg.slice(0, 220);
    } catch {
      return afterColon[1].slice(0, 220);
    }
  }
  return rawMessage.slice(0, 220);
}
