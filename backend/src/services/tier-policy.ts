import type { UserTier } from './entitlements.js';
import {
  resolveFreeDailyLimit,
  resolveFreeModelProfile,
} from './free-model-profile.js';
import {
  OPENROUTER_DEFAULT_FACT_MODEL,
  OPENROUTER_DEFAULT_FREE_FACT_MODEL,
  OPENROUTER_DEFAULT_STORY_MODEL,
  OPENROUTER_FREE_FACT_MODEL_FALLBACK,
  OPENROUTER_TRIAL_FACT_MODEL,
  buildOpenRouterFreeModelChain,
} from './openrouter-models.js';

/** Бесплатный: Gemma :free (+ fallback Nemotron). Trial: Gemma paid. Premium: DeepSeek V3. */
export const TIER_OPENROUTER_FACT_MODEL = OPENROUTER_DEFAULT_FACT_MODEL;
export const TIER_OPENROUTER_TRIAL_FACT_MODEL = OPENROUTER_TRIAL_FACT_MODEL;
export const TIER_OPENROUTER_STORY_MODEL = OPENROUTER_DEFAULT_FACT_MODEL;

export const TRIAL_PRODUCT_MONTHLY = 'trial_stories_monthly';
export const TRIAL_PRICE_RUB_MONTHLY = 1;

export interface TierStoryLimits {
  dailyStories: number;
  /** Сколько историй за платный trial-период (месяц). null = только дневной лимит. */
  monthlyStories: number | null;
  labelRu: string;
}

export const TIER_STORY_LIMITS: Record<UserTier, TierStoryLimits> = {
  free: {
    dailyStories: parseInt(process.env.FREE_STORY_DAILY_LIMIT ?? '10', 10),
    monthlyStories: null,
    labelRu: 'Бесплатно',
  },
  trial: {
    dailyStories: parseInt(process.env.TRIAL_STORY_DAILY_LIMIT ?? '10', 10),
    monthlyStories: null,
    labelRu: 'Пробный период',
  },
  premium: {
    dailyStories: parseInt(process.env.PREMIUM_STORY_DAILY_LIMIT ?? '25', 10),
    monthlyStories: null,
    labelRu: 'Подписка',
  },
  unlimited: {
    dailyStories: 999_999,
    monthlyStories: null,
    labelRu: 'Без лимита',
  },
};

export function getStoryLimitsForTier(tier: UserTier): TierStoryLimits {
  return TIER_STORY_LIMITS[tier];
}

/**
 * OpenRouter model for this subscription tier.
 * Free — Gemma :free fact-hunt; trial — Gemma paid; premium — DeepSeek V3.
 */
export function resolveOpenRouterModelForTier(
  tier: UserTier,
  preferred: string | undefined,
  slot: 'fact' | 'story',
  options: { clientOwnKey?: boolean } = {},
): string {
  const fromClient = preferred?.trim();
  if (options.clientOwnKey && fromClient && fromClient.includes('/')) {
    return fromClient;
  }

  if (tier === 'free') {
    if (
      fromClient &&
      fromClient.includes('/') &&
      (fromClient.includes(':free') || fromClient.includes('nemotron') || fromClient.includes('gemma'))
    ) {
      return resolveFreeModelProfile(fromClient).modelId;
    }
    return resolveFreeModelProfile(undefined).modelId;
  }

  if (tier === 'trial') {
    return slot === 'fact' ? TIER_OPENROUTER_TRIAL_FACT_MODEL : TIER_OPENROUTER_FACT_MODEL;
  }

  if (tier === 'premium' || tier === 'unlimited') {
    return TIER_OPENROUTER_FACT_MODEL;
  }

  return slot === 'fact' ? OPENROUTER_DEFAULT_FREE_FACT_MODEL : OPENROUTER_DEFAULT_STORY_MODEL;
}

/** Fact-hunt: free tier — user pick + :free chain on 429. */
export function resolveOpenRouterFactModelsForTier(
  tier: UserTier,
  preferredModel?: string,
): string[] {
  if (tier === 'free') {
    return buildOpenRouterFreeModelChain(
      preferredModel?.trim() || resolveFreeModelProfile(preferredModel).modelId,
    );
  }
  if (tier === 'trial') {
    return [TIER_OPENROUTER_TRIAL_FACT_MODEL, TIER_OPENROUTER_FACT_MODEL];
  }
  return [TIER_OPENROUTER_FACT_MODEL];
}

/** Free story: user pick → Liquid LFM → Nemotron; Groq fallback in story-llm-router if all 429. */
export function resolveOpenRouterStoryModelsForTier(
  tier: UserTier,
  preferredModel?: string,
): string[] {
  if (tier === 'free') {
    return buildOpenRouterFreeModelChain(
      preferredModel?.trim() || resolveFreeModelProfile(preferredModel).modelId,
    );
  }
  if (tier === 'trial') {
    return [TIER_OPENROUTER_FACT_MODEL];
  }
  return [TIER_OPENROUTER_FACT_MODEL];
}

export function tierQuotaHintRu(tier: UserTier): string {
  const limits = getStoryLimitsForTier(tier);
  if (tier === 'unlimited') return 'Без лимитов на этом устройстве.';
  if (tier === 'free') {
    return `Бесплатно: ${limits.dailyStories} историй в день (OpenRouter :free на сервере). Свой ключ OpenRouter в настройках — любая модель. Trial ${TRIAL_PRICE_RUB_MONTHLY} ₽/мес — ${TIER_STORY_LIMITS.trial.dailyStories}/день DeepSeek. Подписка 199 ₽/мес — ${TIER_STORY_LIMITS.premium.dailyStories}/день.`;
  }
  if (tier === 'trial') {
    return `Пробный период: ${limits.dailyStories} историй/день. Fact-hunt: Gemma 4, история: DeepSeek V3.`;
  }
  return `Подписка: до ${limits.dailyStories} историй/день, DeepSeek V3. Премиум-голос SaluteSpeech — отдельно.`;
}
