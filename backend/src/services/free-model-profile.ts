import {
  OPENROUTER_DEFAULT_FREE_FACT_MODEL,
  OPENROUTER_FREE_FACT_MODEL_FALLBACK,
} from './openrouter-models.js';

export type FreeModelProfileId = 'economy' | 'quality';

export interface FreeModelProfile {
  id: FreeModelProfileId;
  modelId: string;
  dailyStories: number;
  labelRu: string;
  descriptionRu: string;
}

export const FREE_MODEL_PROFILES: Record<FreeModelProfileId, FreeModelProfile> = {
  economy: {
    id: 'economy',
    modelId: OPENROUTER_FREE_FACT_MODEL_FALLBACK,
    dailyStories: parseInt(process.env.FREE_ECONOMY_DAILY_LIMIT ?? '10', 10),
    labelRu: 'Nemotron (бесплатно)',
    descriptionRu:
      'Может думать дольше, факты средние. До 10 историй в день. Лимиты не суммируются с другой моделью.',
  },
  quality: {
    id: 'quality',
    modelId: OPENROUTER_DEFAULT_FREE_FACT_MODEL,
    dailyStories: parseInt(process.env.FREE_QUALITY_DAILY_LIMIT ?? '5', 10),
    labelRu: 'Gemma 4 (бесплатно)',
    descriptionRu:
      'Быстрее и точнее, но до 5 историй в день. Лимиты не суммируются с Nemotron.',
  },
};

export function resolveFreeModelProfile(preferredModelId?: string): FreeModelProfile {
  const id = preferredModelId?.trim().toLowerCase() ?? '';
  if (id.includes('gemma') && id.includes(':free')) return FREE_MODEL_PROFILES.quality;
  if (id.includes('nemotron') && id.includes(':free')) return FREE_MODEL_PROFILES.economy;
  return FREE_MODEL_PROFILES.quality;
}

export function resolveFreeDailyLimit(preferredModelId?: string): number {
  return resolveFreeModelProfile(preferredModelId).dailyStories;
}
