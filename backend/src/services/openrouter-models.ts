/** Free-tier OpenRouter models (:free). See https://openrouter.ai/collections/free-models */

export interface OpenRouterModelOption {
  id: string;
  labelRu: string;
  descriptionRu: string;
  /** Verified in test-all-openrouter-models.mjs — shown as «оптимальная» in UI */
  stable?: boolean;
  recommended?: boolean;
  /** fact-hunt (stronger) vs story (faster) default slot */
  slot?: 'fact' | 'story' | 'both';
}

export const OPENROUTER_MODEL_CUSTOM = '__custom__';

/** Лучшая по benchmark fact-hunt (scripts/benchmark-fact-hunt-models.mjs) — ~$0.20/M in */
export const OPENROUTER_DEFAULT_FACT_MODEL = 'deepseek/deepseek-chat-v3-0324';

/** Бесплатная альтернатива для фактов — стабильнее :free с 429 */
export const OPENROUTER_DEFAULT_FREE_FACT_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';

/** Быстрая free для текста истории (факты слабее) */
export const OPENROUTER_DEFAULT_STORY_MODEL = 'liquid/lfm-2.5-1.2b-instruct:free';

/** По умолчанию для сервера — fact-модель (главный гэп) */
export const OPENROUTER_DEFAULT_MODEL = OPENROUTER_DEFAULT_FACT_MODEL;

export const OPENROUTER_FREE_MODELS: OpenRouterModelOption[] = [
  {
    id: OPENROUTER_DEFAULT_FACT_MODEL,
    labelRu: 'DeepSeek V3',
    descriptionRu: 'Дешёвая (~$0.20/M) — лучшая для поиска фактов',
    stable: true,
    recommended: true,
    slot: 'fact',
  },
  {
    id: OPENROUTER_DEFAULT_FREE_FACT_MODEL,
    labelRu: 'Nemotron 3 Nano 30B',
    descriptionRu: 'Бесплатная — хорошо находит факты в сниппетах',
    stable: true,
    slot: 'fact',
  },
  {
    id: 'google/gemma-4-26b-a4b-it',
    labelRu: 'Gemma 4 26B',
    descriptionRu: 'Дешёвая (~$0.06/M) — JSON и факты',
    stable: true,
    slot: 'fact',
  },
  {
    id: OPENROUTER_DEFAULT_STORY_MODEL,
    labelRu: 'Liquid LFM 2.5 1.2B',
    descriptionRu: 'Free — быстрый текст, факты слабее',
    stable: true,
    slot: 'story',
  },
];

/** Presets verified by test-all-openrouter-models.mjs */
export const OPENROUTER_STABLE_MODELS = OPENROUTER_FREE_MODELS.filter((m) => m.stable);

const PRESET_IDS = new Set(OPENROUTER_FREE_MODELS.map((m) => m.id));

export function isOpenRouterPresetModel(id: string): boolean {
  return PRESET_IDS.has(id.trim());
}

export function resolveOpenRouterModel(
  preferred: string | undefined,
  slot: 'fact' | 'story' = 'story',
): string {
  const fromRequest = preferred?.trim();
  if (fromRequest && fromRequest !== OPENROUTER_MODEL_CUSTOM && fromRequest.includes('/')) {
    return fromRequest;
  }

  if (slot === 'fact') {
    return (
      process.env.OPENROUTER_FACT_MODEL?.trim() ||
      process.env.OPENROUTER_DEFAULT_MODEL?.trim() ||
      OPENROUTER_DEFAULT_FACT_MODEL
    );
  }

  return (
    process.env.OPENROUTER_STORY_MODEL?.trim() ||
    process.env.OPENROUTER_DEFAULT_MODEL?.trim() ||
    OPENROUTER_DEFAULT_STORY_MODEL
  );
}

/** Только одна модель — без перебора и 429 на других free. */
export function resolveOpenRouterModelOrder(
  preferred: string | undefined,
  slot: 'fact' | 'story' = 'story',
): string[] {
  return [resolveOpenRouterModel(preferred, slot)];
}
