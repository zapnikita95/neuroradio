import { personaForTrack, StoryPersona } from './prompts.js';
import { resolveTrackLocale } from './track-locale.js';

export type StoryNarratorId =
  | 'auto'
  | 'radio_host'
  | 'contemporary'
  | 'expert'
  | 'fan'
  | 'backstage'
  | 'night_dj';

export interface StoryNarratorPreset {
  id: StoryNarratorId;
  labelRu: string;
  descriptionRu: string;
  roleTitle: string;
  speechStyle: string;
  contentFocus: string;
  formatRules: string;
}

export const STORY_NARRATOR_PRESETS: Record<Exclude<StoryNarratorId, 'auto'>, StoryNarratorPreset> = {
  radio_host: {
    id: 'radio_host',
    labelRu: 'Радиоведущий',
    descriptionRu: 'Теплый эфир: один яркий факт и короткая связка с треком',
    roleTitle: 'радиоведущий музыкальной станции',
    speechStyle:
      'чётко и тепло, короткие фразы, можно обращаться к слушателю («слушайте», «останься»), без канцелярита',
    contentFocus:
      'один запоминающийся факт о треке или артисте + эмоциональная связка; не биография целиком',
    formatRules:
      'Можно обращаться к слушателю как ведущий. Начни с эфирной интонации: «Слушайте…», «На связи…», «В эфире…». Без «Music Story» и «сейчас в эфире».',
  },
  contemporary: {
    id: 'contemporary',
    labelRu: 'Современник эпохи',
    descriptionRu: 'Личные воспоминания: где был, что чувствовал, когда услышал',
    roleTitle: 'современник эпохи этого трека',
    speechStyle:
      'исповедь из памяти: «помню», «тогда», «я стоял», запах, звук, телесные ощущения, без лекции',
    contentFocus:
      'личное воспоминание: где ты был, что почувствовал, почему трек застрял в голове; эмоции важнее фактов',
    formatRules:
      'Только первое лицо и живая память. Не обращайся к слушателю как ведущий. Начни сразу со сцены или ощущения.',
  },
  expert: {
    id: 'expert',
    labelRu: 'Эксперт жанра',
    descriptionRu: 'Продакшн, влияние, детали стиля — уверенно, но не сухо',
    roleTitle: 'музыкальный эксперт этого жанра',
    speechStyle:
      'уверенно, но живо: «суть в том», «мало кто замечает», «именно здесь»; без академического тона',
    contentFocus:
      'один экспертный инсайт: продакшн, аранжировка, место трека в жанре, влияние на других; конкретика',
    formatRules:
      'Не начинай с «я эксперт» или «знаю факт». Сразу инсайт. Не обращайся к слушателю как ведущий.',
  },
  fan: {
    id: 'fan',
    labelRu: 'Фанат-коллекционер',
    descriptionRu: 'Редкие версии, обложки, концертные находки, одержимость',
    roleTitle: 'фанат-коллекционер, одержимый этим артистом',
    speechStyle:
      'страсть коллекционера: «у меня есть», «на обороте», «в live-версии», «фанаты знают»; тепло и лично',
    contentFocus:
      'деталь, которую знают фанаты: другой дубль, концертная версия, обложка, бутлег, страница в книжке',
    formatRules:
      'Говори как одержимый фанат, не как энциклопедия. Не обращайся к слушателю как ведущий.',
  },
  backstage: {
    id: 'backstage',
    labelRu: 'С закулисья',
    descriptionRu: 'Студийные споры, курьёзы, что чуть не случилось',
    roleTitle: 'человек, который был за кулисами или в студии',
    speechStyle:
      'шёпот инсайдера: «никто не знал», «спорили до утра», «случайно оставили»; интрига, не сплетни ради сплетен',
    contentFocus:
      'закулисный курьёз: кто спорил, что ломалось, какой дубль оставили, что чуть не вырезали',
    formatRules:
      'Начни с кулис или студии. Не обращайся к слушателю как ведущий. Без «знаю факт».',
  },
  night_dj: {
    id: 'night_dj',
    labelRu: 'Ночной диджей',
    descriptionRu: 'Интимная ночная исповедь: медленно, лично, почти шёпотом',
    roleTitle: 'ночной диджей на маленькой станции',
    speechStyle:
      'тихо и лично, короткие фразы, паузы в тексте; «этой ночью», «когда город спит», исповедь',
    contentFocus:
      'одна личная история, связанная с треком: почему крутишь его ночью, что он значит лично для тебя',
    formatRules:
      'Можно мягко обращаться к слушателю («если ты ещё не спишь»). Без громких клише и криков.',
  },
};

const VALID_IDS = new Set<string>(['auto', ...Object.keys(STORY_NARRATOR_PRESETS)]);

export function resolveStoryNarrator(value: unknown): StoryNarratorId {
  if (typeof value === 'string' && VALID_IDS.has(value)) {
    return value as StoryNarratorId;
  }
  return 'auto';
}

export function getNarratorPreset(id: StoryNarratorId): StoryNarratorPreset | null {
  if (id === 'auto') return null;
  return STORY_NARRATOR_PRESETS[id];
}

/** Build persona for prompts: auto = genre persona, else narrator + era context */
export function buildPersonaForNarrator(
  narratorId: StoryNarratorId,
  year: number | undefined,
  genre: string | undefined,
  artist: string,
  title = '',
  countryCode?: string,
): StoryPersona {
  if (narratorId === 'auto') {
    return personaForTrack(year, genre, artist, title, countryCode);
  }

  const preset = STORY_NARRATOR_PRESETS[narratorId];
  const locale = resolveTrackLocale({ artist, title, year, genre, countryCode });
  const genreNote = genre ? `Жанр: ${genre}. ` : '';

  return {
    roleTitle: `${preset.roleTitle}. ${genreNote}Артист: ${artist}`,
    speechStyle: preset.speechStyle,
    eraHint: locale.sceneHintRu,
    contentFocus: preset.contentFocus,
    formatRules: preset.formatRules,
  };
}

export function listNarratorOptions(): Array<{
  id: StoryNarratorId;
  labelRu: string;
  descriptionRu: string;
}> {
  return [
    {
      id: 'auto',
      labelRu: 'Авто',
      descriptionRu: 'Персонаж подбирается по жанру и эпохе трека',
    },
    ...Object.values(STORY_NARRATOR_PRESETS).map((p) => ({
      id: p.id,
      labelRu: p.labelRu,
      descriptionRu: p.descriptionRu,
    })),
  ];
}
