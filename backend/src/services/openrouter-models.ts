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

/** Бесплатный fact-hunt — Gemma 4 :free (лимиты RPM, 429). Запасной вариант. */
export const OPENROUTER_DEFAULT_FREE_FACT_MODEL = 'google/gemma-4-26b-a4b-it:free';

/** Запасной free при 429. */
export const OPENROUTER_FREE_FACT_MODEL_FALLBACK = 'nvidia/nemotron-3-nano-30b-a3b:free';

/** Trial / free stable fact-hunt: Gemma 4 26B paid (~$0.06/M). */
export const OPENROUTER_TRIAL_FACT_MODEL = 'google/gemma-4-26b-a4b-it';

/**
 * Free story default — Llama 3.3 70B (~$0.10/M in, $0.32/M out): лучше Gemma, дешевле DeepSeek V3.
 * Override: OPENROUTER_FREE_STORY_MODEL.
 */
export const OPENROUTER_FREE_MID_TIER_MODEL = 'meta-llama/llama-3.3-70b-instruct';

/**
 * Стабильная модель для free fact-hunt на сервере — paid Gemma.
 * Override: OPENROUTER_FREE_FACT_MODEL.
 */
export const OPENROUTER_FREE_STABLE_MODEL = OPENROUTER_TRIAL_FACT_MODEL;

/** Premium / trial story+fact: DeepSeek V3 (~$0.20/M, лучшее качество). */
export const OPENROUTER_DEFAULT_FACT_MODEL = 'deepseek/deepseek-chat-v3-0324';

/** Быстрая free для текста истории (факты слабее) */
export const OPENROUTER_DEFAULT_STORY_MODEL = 'liquid/lfm-2.5-1.2b-instruct:free';

/** По умолчанию для сервера — fact-модель (главный гэп) */
export const OPENROUTER_DEFAULT_MODEL = OPENROUTER_DEFAULT_FACT_MODEL;

/**
 * Legacy :free chains (OPENROUTER_FREE_LEGACY=true). Default free tier uses paid Gemma.
 */
export const OPENROUTER_FREE_MODEL_CHAIN: readonly string[] = [
  OPENROUTER_DEFAULT_FREE_FACT_MODEL,
  OPENROUTER_FREE_FACT_MODEL_FALLBACK,
  OPENROUTER_DEFAULT_STORY_MODEL,
];

export const OPENROUTER_FREE_STORY_MODEL_CHAIN: readonly string[] = [
  OPENROUTER_DEFAULT_FREE_FACT_MODEL,
  OPENROUTER_FREE_FACT_MODEL_FALLBACK,
];

export function buildOpenRouterFreeStoryModelChain(preferred?: string): string[] {
  const primary =
    process.env.OPENROUTER_FREE_STORY_MODEL?.trim() || OPENROUTER_FREE_MID_TIER_MODEL;
  const pref = preferred?.trim();
  if (process.env.OPENROUTER_FREE_LEGACY === 'true') {
    const legacy = [...OPENROUTER_FREE_STORY_MODEL_CHAIN];
    if (pref && pref.includes(':free')) return [primary, pref, ...legacy.filter((m) => m !== pref && m !== primary)];
    return [primary, ...legacy.filter((m) => m !== primary)];
  }
  if (pref && pref.includes('/') && !pref.includes(':free')) {
    const chain = [pref, primary, OPENROUTER_FREE_STABLE_MODEL, OPENROUTER_FREE_FACT_MODEL_FALLBACK];
    return [...new Set(chain)];
  }
  return [
    primary,
    OPENROUTER_FREE_STABLE_MODEL,
    OPENROUTER_FREE_FACT_MODEL_FALLBACK,
    OPENROUTER_DEFAULT_FACT_MODEL,
  ].filter((m, i, arr) => arr.indexOf(m) === i);
}

export function buildOpenRouterFreeModelChain(preferred?: string): string[] {
  const stable =
    process.env.OPENROUTER_FREE_FACT_MODEL?.trim() || OPENROUTER_FREE_STABLE_MODEL;
  const pref = preferred?.trim();
  if (process.env.OPENROUTER_FREE_LEGACY === 'true') {
    const legacy = [...OPENROUTER_FREE_MODEL_CHAIN];
    if (pref && pref.includes(':free')) return [stable, pref, ...legacy.filter((m) => m !== pref && m !== stable)];
    return [stable, ...legacy.filter((m) => m !== stable)];
  }
  if (pref && pref.includes('/') && !pref.includes(':free')) {
    const chain = [pref, stable, OPENROUTER_FREE_MID_TIER_MODEL, OPENROUTER_FREE_FACT_MODEL_FALLBACK];
    return [...new Set(chain)];
  }
  return [
    stable,
    OPENROUTER_FREE_MID_TIER_MODEL,
    OPENROUTER_FREE_FACT_MODEL_FALLBACK,
  ].filter((m, i, arr) => arr.indexOf(m) === i);
}

export const OPENROUTER_FREE_MODELS: OpenRouterModelOption[] = [
  {
    id: OPENROUTER_DEFAULT_FREE_FACT_MODEL,
    labelRu: 'Gemma 4 26B (free)',
    descriptionRu: 'Бесплатная — JSON fact-hunt, быстрее Nemotron',
    stable: true,
    slot: 'fact',
  },
  {
    id: OPENROUTER_FREE_FACT_MODEL_FALLBACK,
    labelRu: 'Nemotron 3 Nano 30B',
    descriptionRu: 'Запасная free при 429',
    slot: 'fact',
  },
  {
    id: OPENROUTER_TRIAL_FACT_MODEL,
    labelRu: 'Gemma 4 26B',
    descriptionRu: 'Free fact-hunt на сервере — стабильная paid (~$0.06/M)',
    stable: true,
    recommended: true,
    slot: 'both',
  },
  {
    id: OPENROUTER_FREE_MID_TIER_MODEL,
    labelRu: 'Llama 3.3 70B',
    descriptionRu: 'Free story — лучше Gemma, дешевле DeepSeek (~$0.10/M)',
    stable: true,
    recommended: true,
    slot: 'story',
  },
  {
    id: OPENROUTER_DEFAULT_FACT_MODEL,
    labelRu: 'DeepSeek V3',
    descriptionRu: 'Premium — лучшее качество (~$0.20/M)',
    stable: true,
    recommended: true,
    slot: 'both',
  },
  {
    id: OPENROUTER_DEFAULT_STORY_MODEL,
    labelRu: 'Liquid LFM 2.5 1.2B',
    descriptionRu: 'Free — быстрый текст истории',
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

/** Free fact-hunt: user pick → full :free chain. */
export function resolveOpenRouterFactModelOrder(preferred?: string): string[] {
  const fromRequest = preferred?.trim();
  if (fromRequest && fromRequest !== OPENROUTER_MODEL_CUSTOM && fromRequest.includes('/')) {
    if (fromRequest.includes(':free')) return buildOpenRouterFreeModelChain(fromRequest);
    return [fromRequest];
  }
  const env = process.env.OPENROUTER_FACT_MODEL?.trim();
  if (env) return env.includes(':free') ? buildOpenRouterFreeModelChain(env) : [env];
  return buildOpenRouterFreeModelChain();
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
