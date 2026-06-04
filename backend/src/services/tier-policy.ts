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
    dailyStories: parseInt(process.env.FREE_STORY_DAILY_LIMIT ?? '3', 10),
    monthlyStories: null,
    labelRu: 'Бесплатно',
  },
  trial: {
    dailyStories: parseInt(process.env.TRIAL_STORY_DAILY_LIMIT ?? '10', 10),
    monthlyStories: parseInt(process.env.TRIAL_STORY_MONTHLY_LIMIT ?? '10', 10),
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
): string {
  if (tier === 'free') {
    return slot === 'fact' ? OPENROUTER_DEFAULT_FREE_FACT_MODEL : OPENROUTER_DEFAULT_STORY_MODEL;
  }

  if (tier === 'trial' || tier === 'premium') {
    if (
      tier === 'premium' &&
      preferred?.trim() &&
      preferred.includes('/') &&
      isOpenRouterPresetModel(preferred)
    ) {
      return preferred.trim();
    }
    return slot === 'fact' ? TIER_OPENROUTER_FACT_MODEL : TIER_OPENROUTER_STORY_MODEL;
  }

  return slot === 'fact' ? OPENROUTER_DEFAULT_FREE_FACT_MODEL : OPENROUTER_DEFAULT_STORY_MODEL;
}

export function tierQuotaHintRu(tier: UserTier): string {
  const limits = getStoryLimitsForTier(tier);
  if (tier === 'unlimited') return 'Без лимитов на этом устройстве.';
  if (tier === 'free') {
    return `Бесплатно: ${limits.dailyStories} истории в день (модели OpenRouter :free). Пробный период ${TRIAL_PRICE_RUB_MONTHLY} ₽/мес — DeepSeek, ${TIER_STORY_LIMITS.trial.monthlyStories} историй. Подписка 199 ₽/мес — до ${TIER_STORY_LIMITS.premium.dailyStories} в день.`;
  }
  if (tier === 'trial') {
    return `Пробный период: до ${limits.monthlyStories} историй в месяц, не более ${limits.dailyStories} в день. Модель DeepSeek V3.`;
  }
  return `Подписка активна: до ${limits.dailyStories} историй в день (DeepSeek V3). Премиум-голос SaluteSpeech — отдельно.`;
}
