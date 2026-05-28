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
        'Модель Gemini без бесплатной квоты (limit: 0) — выбери Gemini 2.0 Flash-Lite. Это не «ты всё потратил за день».',
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
    const dailyFree =
      llmProvider === 'openrouter' &&
      /free-models-per-day|free model requests per day/i.test(lower);
    return {
      code,
      message: dailyFree
        ? 'OpenRouter: дневной лимит бесплатных моделей исчерпан. Подожди до завтра или добавь кредиты на openrouter.ai — в приложении выбрана одна модель, без перебора.'
        : `${label}: слишком много запросов в минуту (RPM). Подожди 1–2 минуты — не жми «Рассказать» подряд на каждом треке.`,
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
    if (/speed|tempo|rate/i.test(lower)) {
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

  return {
    code: 'STORY_FAILED',
    message: rawMessage.slice(0, 200) || 'Story generation failed',
    httpStatus: 500,
  };
}
