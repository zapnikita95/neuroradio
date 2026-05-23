import { getStoryLengthPreset, StoryLengthId } from './story-length.js';
import type { StoryLengthPreset } from './story-length.js';
import {
  buildPersonaForNarrator,
  getNarratorPreset,
  resolveStoryNarrator,
  StoryNarratorId,
} from './story-narrator.js';
import { eraContextForPrompt, resolveTrackLocale, type TrackLocale } from './track-locale.js';

export { eraContextForPrompt, resolveTrackLocale };
export type { TrackLocale };

export { buildPersonaForNarrator, resolveStoryNarrator };
export type { StoryNarratorId };
export interface StoryPersona {
  roleTitle: string;
  speechStyle: string;
  eraHint: string;
  contentFocus?: string;
  formatRules?: string;
}

export const STORY_ANGLES = [
  'конкретная сцена записи или студийный курьёз',
  'где ты был, когда впервые услышал этот трек',
  'живое выступление — что видел своими глазами',
  'закулисье: кто спорил, что ломалось, что удивило',
  'деталь, которую фанаты замечают не с первого раза',
  'история из тусовки жанра в тот сезон',
] as const;

export function pickAngle(previousCount: number): string {
  return STORY_ANGLES[previousCount % STORY_ANGLES.length];
}

function personaForYear(role: string, speech: string, era: string): StoryPersona {
  return { roleTitle: role, speechStyle: speech, eraHint: era };
}

export function personaForTrack(
  year: number | undefined,
  genre: string | undefined,
  artist: string,
  title = '',
  countryCode?: string,
): StoryPersona {
  const locale = resolveTrackLocale({ artist, title, year, genre, countryCode });
  const g = (genre ?? '').toLowerCase();
  const a = artist.toLowerCase();
  const era = locale.sceneHintRu;

  if (a.includes('james brown') || g.includes('funk')) {
    return personaForYear(
      'парень из Гарлема, soul/funk, ходит в Apollo и знает каждый крик Brown',
      'короткие рваные фразы, «слушай», «тогда», «та ночь», энергия сцены',
      `${era}. Apollo Theater, один дубль, номер с плащом`,
    );
  }

  if (a.includes('elvis')) {
    return personaForYear(
      "фанат rock'n'roll, собирает синглы Elvis",
      '«помню», «тогда», «Король», без современного сленга',
      `${era}. студия RCA, телеспецвыпуски, реакция зала`,
    );
  }

  if (
    g.includes('jazz') ||
    g.includes('swing') ||
    g.includes('bebop') ||
    (year !== undefined && year >= 1935 && year <= 1965 && (g.includes('blues') || !g))
  ) {
    return personaForYear(
      'джазмен, одержим свингом и бибопом',
      '«брат», «слушай сюда», джем-сейшены, импровизация',
      `${era}. винил, живое радио, ночные клубы`,
    );
  }

  if (g.includes('blues') || g.includes('soul')) {
    return personaForYear(
      'блюзовый меломан с юга или из клуба',
      '«дитя», «та ночь», исповедь, гитара, пот на сцене',
      `${era}. ночной клуб, юг США`,
    );
  }

  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) {
    return personaForYear(
      'рок-фанат, был на концертах',
      '«тот концерт», «мы были», громкость, бунт',
      `${era}. гаражи, фестивали`,
    );
  }

  if (g.includes('electronic') || g.includes('house') || g.includes('techno') || g.includes('dance')) {
    return personaForYear(
      'клубный меломан',
      'брейк, сэмпл, бас, склад, ночь',
      `${era}. диджейские стыки, новая музыка из старых пластинок`,
    );
  }

  if (g.includes('hip hop') || g.includes('rap')) {
    return personaForYear(
      locale.countryCode === 'RU' ? 'фанат российского рэпа' : 'фанат хип-хопа с блока',
      locale.countryCode === 'RU'
        ? 'поток, площадки, студии, честная уличная речь'
        : 'поток, вечеринка на блоке, уличная честность',
      era,
    );
  }

  if (g.includes('country') || title.toLowerCase().includes('кантри')) {
    return personaForYear(
      locale.countryCode === 'RU' ? `фанат ${artist}, российская кантри-сцена` : `фанат ${artist}`,
      locale.countryCode === 'RU'
        ? 'живая речь, российские студии и площадки, без Nashville-клише'
        : 'живая речь, уважение к эпохе трека',
      era,
    );
  }

  if (g.includes('pop') || a.includes('beatles') || a.includes('abba')) {
    return personaForYear(
      'обожатель поп-культуры',
      '«то лето», «по радио», телевизор и магнитофоны',
      `${era}. телевидение, магнитофоны, кассеты`,
    );
  }

  return personaForYear(
    `фанат ${artist}`,
    'живая речь, уважение к эпохе трека, без энциклопедичности',
    era,
  );
}

export function buildSystemPrompt(persona: StoryPersona, length: StoryLengthPreset): string {
  const durationHint = length.targetSeconds
    ? `~${length.targetSeconds} секунд речи`
    : 'развёрнутый рассказ без жёсткого лимита';

  const formatBlock = persona.formatRules
    ? persona.formatRules
    : 'Начинай СРАЗУ со сцены. НЕ обращайся к слушателю как ведущий — ты делишься воспоминанием.';

  const focusBlock = persona.contentFocus
    ? `ФОКУС СОДЕРЖАНИЯ: ${persona.contentFocus}`
    : 'Один запоминающийся факт — не «зал сходит с ума», не «артист в огне»';

  return `Ты пишешь текст для ОЗВУЧКИ — живой человек рассказывает историю.

КТО ТЫ: ${persona.roleTitle}
КОНТЕКСТ ЭПОХИ: ${persona.eraHint}
КАК ТЫ ГОВОРИШЬ: ${persona.speechStyle}
${focusBlock}

ЛОКАЛЬ И ЭПОХА:
- История должна совпадать со страной происхождения трека и его реальной эпохой
- Российский современный трек — не «радиола», не Apollo, не Nashville
- Если год неизвестен, не выдумывай винтаж — ориентируйся на сцену страны артиста

ЯЗЫК: только русский. Английский допустим ТОЛЬКО в именах артистов и названиях песен.

ЧИСЛА — КРИТИЧНО:
- В script НЕЛЬЗЯ писать цифры, годы, «N-й», «шестидесятых» и т.п.
- Исключение: цифры только из имени артиста или названия трека (2Pac, «1999»)
- Вместо дат: «тогда», «в те годы», «на заре», «однажды на концерте», «в студии»

ФОРМАТ:
- ${formatBlock}
- НЕ начинай: «знаю факт», «интересно что», «вот что», «слушай факт»

СОДЕРЖАНИЕ:
- ${length.wordsMin}–${length.wordsMax} слов (${durationHint})
- ${length.sentenceHint}, каждое с конкретикой: место, люди, звук, запах

РАЗМЕТКА ДЛЯ Yandex SpeechKit:
- НЕ ставь знаки + и [[фонемы]] в script — сервер расставит ударения и произношение имён сам

ЗАПРЕЩЕНО:
- цифры и даты (кроме имени/названия)
- английские слова, кроме имён и названий
- «братуха», «братан», «Music Story», «сейчас в эфире»
- вода: «вкладывает душу», «магия музыки», «зал сходит с ума»

JSON: {"script":"...", "word_count": число, "voiceId": "alena | filipp | ermil | jane | omazh | zahar | marina | dasha | julia | kirill | masha | alexander | lera"}`;
}
export function buildStoryUserPrompt(params: {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  countryCode?: string;
  voiceId: string;
  angle: string;
  storyLength: StoryLengthId;
  storyNarrator?: StoryNarratorId;
  previousScripts?: string[];
  retryReason?: string;
}): string {
  const narratorId = resolveStoryNarrator(params.storyNarrator);
  const locale = resolveTrackLocale({
    artist: params.artist,
    title: params.title,
    year: params.year,
    genre: params.genre,
    countryCode: params.countryCode,
  });
  const persona = buildPersonaForNarrator(
    narratorId,
    params.year,
    params.genre,
    params.artist,
    params.title,
    params.countryCode,
  );
  const length = getStoryLengthPreset(params.storyLength);
  const lines: string[] = [
    `Артист: ${params.artist}`,
    `Трек: ${params.title}`,
  ];

  if (params.genre) lines.push(`Жанр: ${params.genre}`);
  lines.push(`Страна/сцена: ${locale.countryLabelRu}`);
  lines.push(`Год релиза (только для тебя, НЕ писать цифры в script): ${locale.yearLabelRu}`);
  lines.push(`Эпоха и контекст: ${locale.sceneHintRu}`);
  lines.push(`ЛОКАЛЬ: ${locale.localeRulesRu}`);
  lines.push('');
  lines.push(`УГОЛ ИСТОРИИ: ${params.angle}`);
  lines.push(`Ты — ${persona.roleTitle}. Говоришь так: ${persona.speechStyle}`);
  if (narratorId !== 'auto') {
    const preset = getNarratorPreset(narratorId);
    if (preset) {
      lines.push(`РЕЖИМ РАССКАЗЧИКА: ${preset.labelRu} — ${preset.descriptionRu}`);
    }
  }
  lines.push(`Длина: ${length.wordsMin}–${length.wordsMax} слов.`);
  lines.push('В script — никаких цифр и годов, кроме цифр из имени артиста или названия трека.');

  if (params.retryReason) {
    lines.push('');
    lines.push(`ПРЕДЫДУЩИЙ ОТВЕТ ОТКЛОНЁН: ${params.retryReason}`);
    lines.push('Перепиши полностью: другая сцена, без цифр, без английских слов, без мета-зачинов.');
  }

  lines.push('');
  const prev = params.previousScripts?.filter(Boolean) ?? [];
  if (prev.length > 0) {
    lines.push('УЖЕ РАССКАЗАНО — другой факт, другая сцена:');
    prev.slice(0, 5).forEach((s, i) => {
      const snippet = s.length > 200 ? `${s.slice(0, 200)}…` : s;
      lines.push(`${i + 1}. ${snippet}`);
    });
  } else {
    lines.push('Первый рассказ — сразу погружай в сцену.');
  }

  lines.push('');
  lines.push(`Голос (voiceId): ${params.voiceId}`);
  lines.push('Ответ в JSON.');

  return lines.join('\n');
}
