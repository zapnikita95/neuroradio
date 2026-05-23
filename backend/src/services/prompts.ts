import { getStoryLengthPreset, StoryLengthId } from './story-length.js';
import type { StoryLengthPreset } from './story-length.js';
import {
  buildPersonaForNarrator,
  getNarratorPreset,
  resolveStoryNarrator,
  StoryNarratorId,
} from './story-narrator.js';

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

export function eraContextForPrompt(year: number | undefined, genre: string | undefined): string {
  const g = (genre ?? '').toLowerCase();
  if (g.includes('jazz') || g.includes('swing')) return 'джазовая эпоха, клубы и джем-сейшены';
  if (g.includes('blues') || g.includes('soul')) return 'soul и blues, южные клубы и ночные сцены';
  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) return 'рок-сцена, концерты и гаражи';
  if (g.includes('electronic') || g.includes('house') || g.includes('techno') || g.includes('dance')) {
    return 'клубная электроника, склады и диджейские стыки';
  }
  if (g.includes('hip hop') || g.includes('rap')) return 'хип-хоп с блока, уличные вечеринки';
  if (g.includes('pop')) return 'поп-культура, радио и телевидение';
  if (!year) return 'эпоха артиста';
  if (year < 1960) return 'ранний период, винил и живое радио';
  if (year < 1970) return 'расцвет soul и rock, Apollo и Abbey Road';
  if (year < 1980) return 'золотая эра рока и диско';
  if (year < 1990) return 'MTV, кассеты и фестивали';
  if (year < 2000) return 'клубы и ремиксы';
  if (year < 2010) return 'интернет-форумы и первые стримы';
  return 'современная сцена, архивы и редкие концерты';
}

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
): StoryPersona {
  const g = (genre ?? '').toLowerCase();
  const a = artist.toLowerCase();
  const era = eraContextForPrompt(year, genre);

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
      'фанат хип-хопа с блока',
      'поток, вечеринка на блоке, уличная честность',
      `${era}. битбокс, слова как оружие и щит`,
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
- В русских словах с неочевидным ударением ставь + перед ударной гласной
- Имена артистов и названия — латиницей в «кавычках»

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
  voiceId: string;
  angle: string;
  storyLength: StoryLengthId;
  storyNarrator?: StoryNarratorId;
  previousScripts?: string[];
  retryReason?: string;
}): string {
  const narratorId = resolveStoryNarrator(params.storyNarrator);
  const persona = buildPersonaForNarrator(narratorId, params.year, params.genre, params.artist);
  const length = getStoryLengthPreset(params.storyLength);
  const era = eraContextForPrompt(params.year, params.genre);
  const lines: string[] = [
    `Артист: ${params.artist}`,
    `Трек: ${params.title}`,
  ];

  if (params.genre) lines.push(`Жанр: ${params.genre}`);
  lines.push(`Эпоха (контекст, НЕ писать даты в текст): ${era}`);
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
