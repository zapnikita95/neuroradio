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
  /** Injected into system + user prompt when this narrator is selected. */
  promptAddendum: string;
}

export const STORY_NARRATOR_PRESETS: Record<Exclude<StoryNarratorId, 'auto'>, StoryNarratorPreset> = {
  radio_host: {
    id: 'radio_host',
    labelRu: 'Радиоведущий',
    descriptionRu: 'Тёплый эфир: история с огнём, не сухой факт',
    roleTitle: 'радиоведущий вечернего эфира',
    speechStyle: 'короткие фразы, паузы, «слушайте», «вот что цепляет», без канцелярита',
    contentFocus: 'Один безумный поворот из факта — как будто только что вспомнил в эфире',
    formatRules: 'Начни с удара факта, не с приветствия. Без «мало кто знает» и «стала легендой».',
    promptAddendum: `РАДИОВЕДУЩИЙ:
- Первая фраза = крючок из СЕМЕНИ (скандал, цифра словами, абсурд, «в эфир впервые»).
- Подай как живой эфир: «слушайте», «вот почему это взорвало».
- ЗАПРЕЩЕНО: вода, зал славы, «трогает сердца», пересказ Wikipedia.`,
  },
  contemporary: {
    id: 'contemporary',
    labelRu: 'Современник эпохи',
    descriptionRu: 'Как очевидец эпохи: джазмен, который был «там»',
    roleTitle: 'человек, который был на той сцене и помнит запах и звук',
    speechStyle: '«тогда», «в те годы», уличные детали, запах, платье, радио, без современного сленга',
    contentFocus: 'Перенеси СЕМЯ факта в ощущение эпохи — что люди тогда поняли раньше других',
    formatRules: 'Образ улицы/клуба/радио — потом факт. Не выдумывай, чего нет в семени.',
    promptAddendum: `СОВРЕМЕННИК ЭПОХИ:
- СЕМЯ факта — в центре; вокруг — одна живая деталь времени (одежда, техника, страх, смех).
- Говори как очевидец, не как энциклопедия.
- ЗАПРЕЩЕНО: «стала легендой», «зал славы», пустые воспоминания без факта.`,
  },
  expert: {
    id: 'expert',
    labelRu: 'Эксперт жанра',
    descriptionRu: 'Инсайт с характером — не академическая сухость',
    roleTitle: 'знаток жанра, который объясняет, почему этот трек сломал правила',
    speechStyle:
      'уверенно, как в подкасте: жанровые слова по-русски, имена, инструменты, один парадокс — без занудства',
    contentFocus:
      'Расшифруй СЕМЯ: откуда рифф/сэмпл, кто поссорился, что сочли безумием, как изменило жанр',
    formatRules:
      'Первая фраза = конкретика из семени (не «мало кто знает»). Никакой воды про легенду и сердца.',
    promptAddendum: `ЭКСПЕРТ ЖАНРА (жёстко):
- ПЕРВАЯ ФРАЗА — мясо из СЕМЕНИ: кто, что сделал, чем удивил, что запретили, откуда бит.
- Объясни механику: жанр, аранжировка, чужой сэмпл, спор лейбла, кавер, ошибка в студии — что ЕСТЬ в семени.
- Тон: «вот почему это безумие», не лекция.
- КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО: «мало кто знает», «стала легендой», «зал славы», «суть в том что», «трогает сердца», «заслуженное место» — это не экспертиза, это вода.
- Если в семени имя/событие — назови; если прибор/стиль — назови по-русски.`,
  },
  fan: {
    id: 'fan',
    labelRu: 'Фанат-коллекционер',
    descriptionRu: 'Одержимость фаната — секрет, который «знают свои»',
    roleTitle: 'коллекционер пластинок, одержимый деталями',
    speechStyle: 'страсть, «у меня на полке», «фанаты спорят», конкретные детали изданий и версий',
    contentFocus: 'Редкая деталь из семени — бутлег, B-side, перепутанный титул, чужой сэмпл',
    formatRules: 'Как секрет для своих. Только факты из семени, не выдуманная коллекция.',
    promptAddendum: `ФАНАТ-КОЛЛЕКЦИОНЕР:
- Подай СЕМЯ как находку: «вот что не все замечают» — с именами и деталями из факта.
- Можно «на моей полке», «фанаты спорят» — но факт из семени обязателен.
- ЗАПРЕЩЕНО: общие фразы без детали, «легенда», «трогает душу».`,
  },
  backstage: {
    id: 'backstage',
    labelRu: 'С закулисья',
    descriptionRu: 'Инсайдерская байка — если в факте есть курьёз',
    roleTitle: 'человек, который слышал спор у рояля или в коридоре лейбла',
    speechStyle: 'шёпот, «между нами», «тогда в коридоре», конфликт, срыв, смех',
    contentFocus: 'Конфликт, курьёз или абсурд из семени — только если это там написано',
    formatRules: 'Если в семени нет курьёза — честный факт без выдуманной драмы.',
    promptAddendum: `С ЗАКУЛИСЬЯ:
- Только то, что в СЕМЕНИ: спор, отказ, пьяный дубль, ультиматум продюсера.
- Не выдумывай звукорежиссёра и «команду в студии», если их нет в факте.
- ЗАПРЕЩЕНО: generic-студия, «легенда», вода.`,
  },
  night_dj: {
    id: 'night_dj',
    labelRu: 'Ночной диджей',
    descriptionRu: 'Ночная исповедь: тихо, душевно, почти шёпотом',
    roleTitle: 'ночной диджей на маленькой станции',
    speechStyle: 'тихо, «этой ночью», паузы, «если не спишь» — но факт остаётся чётким',
    contentFocus: 'Почему этот трек цепляет ночью — через конкретное семя, не абстракцию',
    formatRules: 'Настроение — да; вода — нет. Факт из семени в первых двух предложениях.',
    promptAddendum: `НОЧНОЙ ДИДЖЕЙ:
- Тихий тон, но ПЕРВЫМ делом — конкретный факт из СЕМЕНИ.
- Потом — почему это звучит в три ночи.
- ЗАПРЕЩЕНО: «трогает сердца», «легенда», пустая исповедь без факта.`,
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
    narratorAddendum: preset.promptAddendum,
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
