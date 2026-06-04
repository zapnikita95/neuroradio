import type { UserTier } from './entitlements.js';
import {
  OPENROUTER_DEFAULT_FACT_MODEL,
  OPENROUTER_DEFAULT_FREE_FACT_MODEL,
  OPENROUTER_DEFAULT_STORY_MODEL,
  isOpenRouterPresetModel,
} from './openrouter-models.js';

/** Бесплатный: только :free OpenRouter. Trial/Premium: DeepSeek V3. */
export const TIER_OPENROUTER_FACT_MODEL = OPENROUTER_DEFAULT_FACT_MODEL;
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
 * Free — Nemotron (:free) + Liquid (:free); trial/premium — DeepSeek V3.
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
    return slot === 'fact' ? OPENROUTER_DEFAULT_FREE_FACT_MODEL : OPENROUTER_DEFAULT_STORY_MODEL;
  }

  if (tier === 'trial' || tier === 'premium') {
    if (
      tier === 'premium' &&
      fromClient &&
      fromClient.includes('/') &&
      isOpenRouterPresetModel(fromClient)
    ) {
      return fromClient;
    }
    return TIER_OPENROUTER_FACT_MODEL;
  }

  return slot === 'fact' ? OPENROUTER_DEFAULT_FREE_FACT_MODEL : OPENROUTER_DEFAULT_STORY_MODEL;
}

export function tierQuotaHintRu(tier: UserTier): string {
  const limits = getStoryLimitsForTier(tier);
  if (tier === 'unlimited') return 'Без лимитов на этом устройстве.';
  if (tier === 'free') {
    return `Бесплатно: ${limits.dailyStories} историй в день (OpenRouter :free на сервере). Свой ключ OpenRouter в настройках — любая модель. Trial ${TRIAL_PRICE_RUB_MONTHLY} ₽/мес — ${TIER_STORY_LIMITS.trial.dailyStories}/день DeepSeek. Подписка 199 ₽/мес — ${TIER_STORY_LIMITS.premium.dailyStories}/день.`;
  }
  if (tier === 'trial') {
    return `Пробный период: ${limits.dailyStories} историй в день, DeepSeek V3 (ключи сервера).`;
  }
  return `Подписка активна: до ${limits.dailyStories} историй в день (DeepSeek V3). Премиум-голос SaluteSpeech — отдельно.`;
}
