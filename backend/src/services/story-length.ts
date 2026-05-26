/**
 * Word budgets assume TTS slightly above normal (~1.0): ~150 wpm at speed 1.0.
 * 30s preset targets fast speech (1.05–1.14); 60s = main mode at normal–brisk pace.
 */
export type StoryLengthId = '30s' | '60s' | 'unlimited';

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
  '30s': {
    id: '30s',
    labelRu: '30 секунд · быстрый темп',
    targetSeconds: 30,
    wordsMin: 72,
    wordsMax: 100,
    sentenceHint: '4–7 коротких предложений — уложится за ~30 с при быстрой озвучке',
    maxTokens: 720,
  },
  '60s': {
    id: '60s',
    labelRu: '1 минута · основной',
    targetSeconds: 60,
    wordsMin: 130,
    wordsMax: 175,
    sentenceHint: '7–11 предложений — полноценный факт за ~60 с при слегка ускоренной речи',
    maxTokens: 1300,
  },
  unlimited: {
    id: 'unlimited',
    labelRu: 'Не ограничено',
    targetSeconds: null,
    wordsMin: 195,
    wordsMax: 320,
    sentenceHint: '9–15 предложений, развёрнутая история',
    maxTokens: 1600,
  },
};

export const DEFAULT_STORY_LENGTH: StoryLengthId = '60s';

export function resolveStoryLength(value: unknown): StoryLengthId {
  if (value === '15s') return '30s';
  if (typeof value === 'string' && value in STORY_LENGTH_PRESETS) {
    return value as StoryLengthId;
  }
  return DEFAULT_STORY_LENGTH;
}

export function getStoryLengthPreset(id: StoryLengthId): StoryLengthPreset {
  return STORY_LENGTH_PRESETS[id];
}

/** Scales recipe (hook → drama → meaning) to selected TTS duration. */
export function buildLengthStructurePlan(length: StoryLengthPreset): string {
  switch (length.id) {
    case '30s':
      return `ПЛАН ДЛИТЕЛЬНОСТИ (30 сек — короткая, под БЫСТРЫЙ темп озвучки):
- КРЮЧОК → одна сцена драмы из факта → финал одной фразой.
- ${length.wordsMin}–${length.wordsMax} слов максимум, ${length.sentenceHint}.
- Пользователь обычно включает «Быстро» или «Очень быстро» — не раздувай, иначе обрежут.`;
    case '60s':
      return `ПЛАН ДЛИТЕЛЬНОСТИ (60 сек — ОСНОВНОЙ режим, слегка ускоренная речь):
- Крючок → внутренняя кухня (драма из факта) → глубокий смысл.
- ${length.wordsMin}–${length.wordsMax} слов, ${length.sentenceHint}.
- Должен поместиться один сильный факт без воды.`;
    default:
      return `ПЛАН ДЛИТЕЛЬНОСТИ (развёрнуто):
- Полная байка: крючок → кухня → смысл → финальный удар.
- ${length.wordsMin}–${length.wordsMax} слов, ${length.sentenceHint}.`;
  }
}
