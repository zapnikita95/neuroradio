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

/** Одна рабочая free-модель по умолчанию (без цепочки фолбэков). */
export const OPENROUTER_DEFAULT_MODEL = 'liquid/lfm-2.5-1.2b-instruct:free';

export const OPENROUTER_FREE_MODELS: OpenRouterModelOption[] = [
  {
    id: OPENROUTER_DEFAULT_MODEL,
    labelRu: 'Liquid LFM 2.5 1.2B',
    descriptionRu: 'Стабильная free — по умолчанию',
    stable: true,
    recommended: true,
    slot: 'both',
  },
  {
    id: 'openrouter/free',
    labelRu: 'OpenRouter Free (авто)',
    descriptionRu: 'Роутер OpenRouter — часто 429, нестабильно',
    stable: false,
    slot: 'both',
  },
  {
    id: 'deepseek/deepseek-v4-flash:free',
    labelRu: 'DeepSeek V4 Flash',
    descriptionRu: 'Часто rate-limit — нестабильно',
    stable: false,
    slot: 'story',
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-instruct:free',
    labelRu: 'Qwen3 Next 80B',
    descriptionRu: 'Сильнее, но free часто 429',
    stable: false,
    slot: 'fact',
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    labelRu: 'Gemma 4 26B',
    descriptionRu: 'Баланс скорости и качества',
    stable: false,
    slot: 'both',
  },
  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    labelRu: 'Nemotron Nano 9B',
    descriptionRu: 'Компактная free от NVIDIA',
    stable: false,
    slot: 'both',
  },
  {
    id: 'openai/gpt-oss-120b:free',
    labelRu: 'GPT-OSS 120B',
    descriptionRu: 'Крупная free — может быть медленнее или 429',
    stable: false,
    slot: 'fact',
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

  return (
    process.env.OPENROUTER_DEFAULT_MODEL?.trim() ||
    OPENROUTER_DEFAULT_MODEL
  );
}

/** Только одна модель — без перебора и 429 на других free. */
export function resolveOpenRouterModelOrder(
  preferred: string | undefined,
  slot: 'fact' | 'story' = 'story',
): string[] {
  return [resolveOpenRouterModel(preferred, slot)];
}
