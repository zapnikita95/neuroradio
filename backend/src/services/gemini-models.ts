/** Бесплатные модели Gemini API (free tier). Платные — только справочно в UI. */

import type { StoryLengthId } from './story-length.js';

export interface GeminiModelOption {
  id: string;
  labelRu: string;
  descriptionRu: string;
  freeTier: true;
  recommended?: boolean;
}

export interface GeminiPaidModelReference {
  id: string;
  labelRu: string;
}

export const GEMINI_FREE_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-2.0-flash-lite',
    labelRu: 'Gemini 2.0 Flash-Lite',
    descriptionRu: 'Быстрая, щадящая к лимитам',
    freeTier: true,
    recommended: true,
  },
  {
    id: 'gemini-2.0-flash',
    labelRu: 'Gemini 2.0 Flash',
    descriptionRu: 'Баланс скорости и качества',
    freeTier: true,
  },
  {
    id: 'gemini-2.5-flash-lite',
    labelRu: 'Gemini 2.5 Flash-Lite',
    descriptionRu: 'Новее; на free tier часто жёстче RPM, чем 2.0 Flash-Lite',
    freeTier: true,
  },
  {
    id: 'gemini-2.5-flash',
    labelRu: 'Gemini 2.5 Flash',
    descriptionRu: 'Сильнее, но free RPM ниже — при 429 выбери 2.0 Flash-Lite',
    freeTier: true,
  },
];

/** Не используем в генерации — только подсказка пользователю в настройках. */
export const GEMINI_PAID_MODEL_REFERENCES: GeminiPaidModelReference[] = [
  { id: 'gemini-2.5-pro', labelRu: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.0-pro', labelRu: 'Gemini 2.0 Pro' },
];

export const DEFAULT_GEMINI_MODEL =
  GEMINI_FREE_MODELS.find((m) => m.recommended)?.id ?? 'gemini-2.0-flash-lite';

const FREE_MODEL_IDS = new Set(GEMINI_FREE_MODELS.map((m) => m.id));

export function resolveGeminiModel(override?: unknown): string {
  const raw = typeof override === 'string' ? override.trim() : '';
  if (raw && FREE_MODEL_IDS.has(raw)) return raw;
  const fromEnv = process.env.GEMINI_MODEL?.trim();
  if (fromEnv && FREE_MODEL_IDS.has(fromEnv)) return fromEnv;
  return DEFAULT_GEMINI_MODEL;
}

export function geminiModelSettingsLabel(modelId: string): string {
  const model = GEMINI_FREE_MODELS.find((m) => m.id === modelId);
  if (!model) return modelId;
  if (model.recommended) return `${model.labelRu} · бесплатная · оптимальная`;
  return `${model.labelRu} · бесплатная`;
}

export function isGeminiFlashLiteModel(modelId: string): boolean {
  return /flash-lite/i.test(modelId);
}

/** Flash-Lite often undershoots 130w target — accept shorter scripts after retries. */
export function geminiGracefulMinWords(modelId: string, lengthId: StoryLengthId): number {
  const limits = { '30s': 72, '60s': 130, unlimited: 195 } as const;
  const base = limits[lengthId] ?? 130;
  if (isGeminiFlashLiteModel(modelId)) {
    if (lengthId === '30s') return 55;
    if (lengthId === '60s') return 70;
    return Math.max(120, base - 60);
  }
  return Math.max(30, base - 15);
}
