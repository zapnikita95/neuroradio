import { FACT_HUNT_PROMPT_BLOCK } from './story-fact-hunt.js';
import { RUSSIAN_LANGUAGE_PROMPT_BLOCK } from './story-russian-language.js';
import {
  buildLengthStructurePlan,
  DEFAULT_STORY_LENGTH,
  getStoryLengthPreset,
  StoryLengthId,
  type StoryLengthPreset,
} from './story-length.js';
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
  narratorAddendum?: string;
}

export const STORY_ANGLE_PRESETS = [
  {
    id: 'studio',
    labelRu: 'Студия и запись',
    wrapHint:
      'Возьми факт про запись, продюсера, дубль или инструмент — подай как закулисную деталь со студии.',
  },
  {
    id: 'release',
    labelRu: 'Релиз и эфир',
    wrapHint:
      'Возьми факт про выход сингла, радио, чарт, лейбл или клип — подай как эфирную или релизную историю.',
  },
  {
    id: 'live',
    labelRu: 'Концерт и сцена',
    wrapHint:
      'Возьми факт про живое выступление, тур, площадку или реакцию зала — подай как сцену концерта.',
  },
  {
    id: 'production',
    labelRu: 'Продакшн и аранжировка',
    wrapHint:
      'Возьми факт про аранжировку, сэмпл, кавер, инструмент или сведение — подай как техническую находку.',
  },
  {
    id: 'fan_detail',
    labelRu: 'Деталь для фанатов',
    wrapHint:
      'Возьми малоизвестный факт — подай как секрет для внимательных слушателей, без выдуманной биографии.',
  },
  {
    id: 'context',
    labelRu: 'Эпоха и контекст',
    wrapHint:
      'Возьми факт про происхождение трека, жанр или культурный контекст — подай как картину того времени.',
  },
] as const;

/** @deprecated use STORY_ANGLE_PRESETS */
export const STORY_ANGLES = STORY_ANGLE_PRESETS.map((a) => a.labelRu);

export function pickAngle(previousCount: number): (typeof STORY_ANGLE_PRESETS)[number] {
  return STORY_ANGLE_PRESETS[previousCount % STORY_ANGLE_PRESETS.length];
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
    : 'Рассказываешь другу за барной стойкой: факт + метафора + ударная строка.';

  const focusBlock = persona.contentFocus
    ? `ФОКУС: ${persona.contentFocus}`
    : 'Драма и контраст — не сухая статья Wikipedia';

  const lengthPlan = buildLengthStructurePlan(length);
  const narratorBlock = persona.narratorAddendum
    ? `\n${persona.narratorAddendum}\n`
    : '';

  return `Ты пишешь текст для ОЗВУЧКИ — харизматичный музыкальный рассказчик, знаешь изнанку шоу-бизнеса.

РОЛЬ: ${persona.roleTitle}
ЭПОХА: ${persona.eraHint}
ГОЛОС: ${persona.speechStyle}
${focusBlock}
${narratorBlock}
РЕЦЕПТ (масштабируй по длительности):
- Факт + метафора + ударная строка.
- Ищи ДРАМУ и КОНТРАСТ: конфликт, прорыв, скандал, возвращение — что люди почувствовали.
- Опорный факт Wikipedia = семя. Не выдумывай людей и события, которых нет в факте.

${FACT_HUNT_PROMPT_BLOCK}

${lengthPlan}

СТИЛЬ: друг за барной стойкой. Можно «слушай», «чувак», «брат». Не Wikipedia.

КАТЕГОРИЧЕСКИ НЕЛЬЗЯ:
- «изначально называлась», «группа из…», состав, дискография.
- Перечисление рекламы, саундтреков, игр, фильмов.
- Generic-студия: «помогаюсь», «команда работает над треком».

ЯЗЫК: только русский. Английский — только внутри «имя артиста» или «название трека».

${RUSSIAN_LANGUAGE_PROMPT_BLOCK}

ЧИСЛА: без цифр и годов (кроме цифр в имени/названии). Вместо дат: «тогда», «в те годы».

ФОРМАТ:
- ${formatBlock}
- Не начинай: «знаю факт», «интересно что», «вот что»

ЖЁСТКИЙ ОБЪЁМ: ${length.wordsMin}–${length.wordsMax} слов (${durationHint}). ${length.sentenceHint}.
- word_count в JSON — строго в этом диапазоне.

РАЗМЕТКА: без + и [[фонем]] в script.

ЗАПРЕЩЕНО: выдуманные люди, «Music Story», вода «магия музыки», «легендарная».
ЗАПРЕЩЕНО (вода): «мало кто знает», «стала легендой», «зал славы», «суть в том что», «трогает сердца», «заслуженное место» — без конкретики из семени.

ОБЯЗАТЕЛЬНО: в тексте узнаётся СЕМЯ факта (имя, событие, жанровый поворот, скандал, прибор, кавер); слушатель понимает ПОЧЕМУ это безумно/важно.

JSON: {"script":"...", "word_count": число, "voiceId": "alena | filipp | ermil | jane | omazh | zahar | marina | dasha | julia | kirill | masha | alexander | lera"}`;
}

export function buildStoryUserPrompt(params: {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  countryCode?: string;
  voiceId: string;
  storyLength: StoryLengthId;
  storyNarrator?: StoryNarratorId;
  previousScripts?: string[];
  retryReason?: string;
  referenceFacts?: string[];
  selectedReferenceFact?: { fact: string; scope: 'artist' | 'track'; scopeLabelRu: string };
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
  lines.push(`Ты — ${persona.roleTitle}. Говоришь так: ${persona.speechStyle}`);
  if (narratorId !== 'auto') {
    const preset = getNarratorPreset(narratorId);
    if (preset) {
      lines.push(`РАССКАЗЧИК (АМЛУА): ${preset.labelRu} — ${preset.descriptionRu}`);
      lines.push(preset.promptAddendum);
    }
  }
  lines.push(
    'Подача ТОЛЬКО через выбранного рассказчика. Не подгоняй факт под «студию», «концерт» или «релиз» — бери любую грань из семени.',
  );
  lines.push(`ЖЁСТКАЯ ДЛИНА: ${length.wordsMin}–${length.wordsMax} слов (${length.labelRu}).`);
  lines.push(buildLengthStructurePlan(length));
  lines.push('В script — никаких цифр и годов, кроме цифр из имени артиста или названия трека.');

  const facts = params.referenceFacts?.filter(Boolean) ?? [];
  const selected = params.selectedReferenceFact;
  if (selected) {
    lines.push('');
    lines.push(`ФОКУС ИСТОРИИ: факт про ${selected.scopeLabelRu.toUpperCase()} (не смешивай с другими темами).`);
    lines.push('СЕМЯ ИСТОРИИ (проверенный факт из интернета — только это ядро):');
    lines.push(selected.fact);
    lines.push('РЕЦЕПТ ПОДАЧИ:');
    lines.push('1. КРЮЧОК — первая фраза = контраст/парадокс из семени (не «интересный факт»).');
    lines.push('2. РАЗВИТИЕ — одна деталь из семени, переведённая в живую речь (не пересказ статьи).');
    lines.push('3. УДАР — почему это «разорвёт кабину», опираясь на то же семя.');
    lines.push('НЕ: «мало кто знает», «легенда», «зал славы», «трогает сердца», перевод названия.');
    lines.push('НЕ ВЫДУМЫВАЙ: запах сигарет/кофе, «на моей полке», «скрытый смысл — свобода», «зрители сходили с ума» — только если это ЕСТЬ в семени.');
    lines.push('НЕ ВЫДУМЫВАЙ: запрет на радио, «политически неправильная», двойная сессия, сотни дублей — только если это ЕСТЬ в семени.');
    lines.push('ОБЯЗАТЕЛЬНО: минимум два смысловых якоря из семени (имя, место, событие, скандал — переведи на русский).');
    lines.push(RUSSIAN_LANGUAGE_PROMPT_BLOCK);
  } else if (facts.length > 0) {
    lines.push('');
    lines.push(FACT_HUNT_PROMPT_BLOCK);
    lines.push('');
    lines.push('СЕМЕНА ИСТОРИЙ (выбери ОДНО с максимальным контрастом — не рекламу и не дискографию):');
    facts.forEach((fact, i) => lines.push(`${i + 1}. ${fact}`));
  } else {
    lines.push('');
    lines.push(FACT_HUNT_PROMPT_BLOCK);
    lines.push('');
    lines.push(
      'ОПОРНЫЕ ФАКТЫ: Wikipedia, Wikidata, DuckDuckGo, MusicBrainz. Копай глубже — выбери семя с контрастом, без fiction.',
    );
  }

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
    lines.push('Первый рассказ — сразу с факта из Wikipedia, не со студийного fiction.');
  }

  lines.push('');
  lines.push(`Голос (voiceId): ${params.voiceId}`);
  lines.push('Ответ в JSON.');

  return lines.join('\n');
}
