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
    descriptionRu: 'Тёплый эфир: история с огнём, не сухой факт',
    roleTitle: 'радиоведущий, который умеет крутить байки',
    speechStyle: '«слушайте», «останься», короткие фразы, тепло',
    contentFocus: 'Драма из факта — почему это цепляет слушателя',
    formatRules: '«Слушайте…» — и сразу в историю. Не Wikipedia-пересказ.',
  },
  contemporary: {
    id: 'contemporary',
    labelRu: 'Современник эпохи',
    descriptionRu: 'Как очевидец эпохи: джазмен, который был «там»',
    roleTitle: 'современник эпохи этого трека',
    speechStyle: '«тогда», «в те годы», «слушай, брат», дым, радио, улица',
    contentFocus: 'Что люди тогда почувствовали — из факта, не выдумка',
    formatRules: 'Начни образом эпохи. Байка, не статья.',
  },
  expert: {
    id: 'expert',
    labelRu: 'Эксперт жанра',
    descriptionRu: 'Инсайт с характером — не академическая сухость',
    roleTitle: 'музыкальный знаток с огнём в глазах',
    speechStyle: '«мало кто знает», «именно здесь», «суть в том»',
    contentFocus: 'Необычный угол факта — прорыв, скандал, деталь',
    formatRules: 'Сразу крючок. Не «я эксперт».',
  },
  fan: {
    id: 'fan',
    labelRu: 'Фанат-коллекционер',
    descriptionRu: 'Одержимость фаната — секрет, который «знают свои»',
    roleTitle: 'фанат, одержимый этим артистом',
    speechStyle: '«фанаты знают», страсть, детали, тепло',
    contentFocus: 'Редкий поворот из факта — как секрет для своих',
    formatRules: 'Говори как одержимый. Факт — из Wikipedia, не выдуманная коллекция.',
  },
  backstage: {
    id: 'backstage',
    labelRu: 'С закулисья',
    descriptionRu: 'Инсайдерская байка — если в факте есть курьёз',
    roleTitle: 'человек с закулисья',
    speechStyle: '«никто не знал», «спорили до утра», шёпот',
    contentFocus: 'Курьёз или конфликт из факта',
    formatRules: 'Кулисы — только если это в факте.',
  },
  night_dj: {
    id: 'night_dj',
    labelRu: 'Ночной диджей',
    descriptionRu: 'Ночная исповедь: тихо, душевно, почти шёпотом',
    roleTitle: 'ночной диджей на маленькой станции',
    speechStyle: '«этой ночью», «когда город спит», паузы, «если не спишь»',
    contentFocus: 'История как исповедь — почему этот трек цепляет ночью',
    formatRules: '«Этой ночью…» — и история с душой. Не сухой факт.',
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
