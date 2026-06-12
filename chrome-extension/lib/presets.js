/** Пресеты как в Android app — для UI расширения. */

export const TTS_VOICES = [
  { id: 'auto', label: 'Авто' },
  { id: 'alena', label: 'Алёна' },
  { id: 'filipp', label: 'Филипп' },
  { id: 'ermil', label: 'Ермил' },
  { id: 'jane', label: 'Джейн' },
  { id: 'omazh', label: 'Омаж' },
  { id: 'zahar', label: 'Захар' },
  { id: 'marina', label: 'Марина' },
  { id: 'dasha', label: 'Даша' },
  { id: 'julia', label: 'Юлия' },
  { id: 'kirill', label: 'Кирилл' },
  { id: 'masha', label: 'Маша' },
  { id: 'alexander', label: 'Александр' },
  { id: 'lera', label: 'Лера' },
];

export const STORY_NARRATORS = [
  { id: 'auto', label: 'Авто' },
  { id: 'radio_host', label: 'Радиоведущий' },
  { id: 'contemporary', label: 'Современник эпохи' },
  { id: 'expert', label: 'Эксперт жанра' },
  { id: 'fan', label: 'Фанат-коллекционер' },
  { id: 'backstage', label: 'С закулисья' },
  { id: 'night_dj', label: 'Ночной диджей' },
];

export const TTS_SPEEDS = [
  { id: 'very_slow', label: 'Очень медленно', value: 0.88 },
  { id: 'slow', label: 'Медленно', value: 1.0 },
  { id: 'normal', label: 'Нормально', value: 1.15 },
  { id: 'fast', label: 'Быстро', value: 1.32 },
  { id: 'very_fast', label: 'Очень быстро', value: 1.48 },
];

export const TTS_EMOTIONS = [
  { id: 'neutral', label: 'Нейтральная' },
  { id: 'good', label: 'Живая' },
  { id: 'evil', label: 'Строгая' },
];

export const STORY_LENGTHS = [
  { id: '30s', label: '30 сек' },
  { id: '60s', label: '1 минута' },
  { id: 'unlimited', label: 'Длинная' },
];

export const TRIGGER_MODES = [
  { id: 'EVERY_N_TRACKS', label: 'Каждые N треков' },
  { id: 'ALWAYS', label: 'Всегда' },
  { id: 'NEVER', label: 'Никогда (вручную)' },
];

export function speedValue(id) {
  return TTS_SPEEDS.find((s) => s.id === id)?.value ?? 1.15;
}
