/** Free-tier OpenRouter models (:free). See https://openrouter.ai/collections/free-models */

export interface OpenRouterModelOption {
  id: string;
  labelRu: string;
  descriptionRu: string;
  recommended?: boolean;
  /** fact-hunt (stronger) vs story (faster) default slot */
  slot?: 'fact' | 'story' | 'both';
}

export const OPENROUTER_MODEL_CUSTOM = '__custom__';

export const OPENROUTER_FREE_MODELS: OpenRouterModelOption[] = [
  {
    id: 'openrouter/free',
    labelRu: 'OpenRouter Free (авто)',
    descriptionRu: 'Роутер сам выберет бесплатную модель',
    recommended: true,
    slot: 'both',
  },
  {
    id: 'deepseek/deepseek-v4-flash:free',
    labelRu: 'DeepSeek V4 Flash',
    descriptionRu: 'Быстрая free — хороша для стилизации',
    slot: 'story',
  },
  {
    id: 'liquid/lfm-2.5-1.2b-instruct:free',
    labelRu: 'Liquid LFM 2.5 1.2B',
    descriptionRu: 'Очень быстрая free',
    slot: 'story',
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-instruct:free',
    labelRu: 'Qwen3 Next 80B',
    descriptionRu: 'Сильнее для поиска фактов',
    slot: 'fact',
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    labelRu: 'Gemma 4 26B',
    descriptionRu: 'Баланс скорости и качества',
    slot: 'both',
  },
  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    labelRu: 'Nemotron Nano 9B',
    descriptionRu: 'Компактная free от NVIDIA',
    slot: 'both',
  },
  {
    id: 'openai/gpt-oss-120b:free',
    labelRu: 'GPT-OSS 120B',
    descriptionRu: 'Крупная free (может быть медленнее)',
    slot: 'fact',
  },
];

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

  const slotDefault =
    OPENROUTER_FREE_MODELS.find((m) => m.slot === slot) ??
    OPENROUTER_FREE_MODELS.find((m) => m.recommended) ??
    OPENROUTER_FREE_MODELS[0];
  return slotDefault?.id ?? 'openrouter/free';
}

export function resolveOpenRouterModelOrder(
  preferred: string | undefined,
  slot: 'fact' | 'story' = 'story',
): string[] {
  const first = resolveOpenRouterModel(preferred, slot);
  const slotModels = OPENROUTER_FREE_MODELS.filter(
    (m) => m.slot === slot || m.slot === 'both',
  ).map((m) => m.id);
  const all = [first, ...slotModels, ...OPENROUTER_FREE_MODELS.map((m) => m.id)];
  return [...new Set(all.filter((id) => id.includes('/')))];
}
