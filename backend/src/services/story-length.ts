/** ~144 Russian words/min ≈ 2.4 words/sec at natural TTS pace (speed 0.92) */
export type StoryLengthId = '15s' | '30s' | '60s' | 'unlimited';

export interface StoryLengthPreset {
  id: StoryLengthId;
  labelRu: string;
  targetSeconds: number | null;
  wordsMin: number;
  wordsMax: number;
  sentenceHint: string;
  maxTokens: number;
}

export const STORY_LENGTH_PRESETS: Record<StoryLengthId, StoryLengthPreset> = {
  '15s': {
    id: '15s',
    labelRu: '15 секунд',
    targetSeconds: 15,
    wordsMin: 30,
    wordsMax: 42,
    sentenceHint: '2–3 коротких предложения',
    maxTokens: 380,
  },
  '30s': {
    id: '30s',
    labelRu: '30 секунд',
    targetSeconds: 30,
    wordsMin: 65,
    wordsMax: 85,
    sentenceHint: '4–6 коротких предложений',
    maxTokens: 650,
  },
  '60s': {
    id: '60s',
    labelRu: '1 минута',
    targetSeconds: 60,
    wordsMin: 125,
    wordsMax: 160,
    sentenceHint: '6–10 предложений',
    maxTokens: 1200,
  },
  unlimited: {
    id: 'unlimited',
    labelRu: 'Не ограничено',
    targetSeconds: null,
    wordsMin: 180,
    wordsMax: 300,
    sentenceHint: '8–14 предложений, развёрнутая история',
    maxTokens: 1500,
  },
};

export const DEFAULT_STORY_LENGTH: StoryLengthId = '30s';

export function resolveStoryLength(value: unknown): StoryLengthId {
  if (typeof value === 'string' && value in STORY_LENGTH_PRESETS) {
    return value as StoryLengthId;
  }
  return DEFAULT_STORY_LENGTH;
}

export function getStoryLengthPreset(id: StoryLengthId): StoryLengthPreset {
  return STORY_LENGTH_PRESETS[id];
}
