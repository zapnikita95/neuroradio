import { FACT_HUNT_PROMPT_BLOCK } from './story-fact-hunt.js';
import { buildEnglishStoryUserPrompt, buildEnglishSystemPrompt } from './prompts-en.js';
import { RUSSIAN_LANGUAGE_PROMPT_BLOCK } from './story-russian-language.js';
import { type StoryLanguageId, DEFAULT_STORY_LANGUAGE } from './story-language.js';
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
  PERSONA_STYLE_DISCIPLINE,
  resolveStoryNarrator,
  StoryNarratorId,
} from './story-narrator.js';
import { buildStylePromptBlock } from './style-corpus.js';
import { eraContextForPrompt, resolveTrackLocale, type TrackLocale } from './track-locale.js';
import { resolveArtistGrammarRu } from './artist-grammar.js';
import { voiceStoryPromptHint } from './voices.js';
import {
  buildVoiceoverNoNamesPromptBlock,
  isVoiceoverWithoutTrackNames,
  RUSSIAN_LANGUAGE_NO_NAMES_OVERRIDE,
} from './voiceover-no-names.js';

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
      'меломан soul/funk, знает сцену Apollo и живые выступления Brown',
      'короткие рваные фразы, высокая энергия, уличная разговорная интонация',
      `${era}. Apollo Theater, живые дубли, сценические номера`,
    );
  }

  if (a.includes('elvis')) {
    return personaForYear(
      "коллекционер синглов rock'n'roll эпохи Elvis",
      'ностальгический тон, прошедшее время, без современного сленга',
      `${era}. студия RCA, телеспецвыпуски, радиоэфир`,
    );
  }

  if (
    g.includes('jazz') ||
    g.includes('swing') ||
    g.includes('bebop') ||
    (year !== undefined && year >= 1935 && year <= 1965 && (g.includes('blues') || !g))
  ) {
    return personaForYear(
      'меломан джаза и свинга',
      'свободный ритм фраз, жаргон джем-сейшенов, импровизационная подача',
      `${era}. винил, живое радио, ночные клубы`,
    );
  }

  if (g.includes('blues') || g.includes('soul')) {
    return personaForYear(
      'меломан блюза и соула',
      'исповедальный тон, короткие образные фразы, интонация клубной сцены',
      `${era}. ночной клуб, юг США`,
    );
  }

  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) {
    return personaForYear(
      'рок-меломан, ходил на концерты',
      'разговорный напор, воспоминания о живых выступлениях, громкая подача',
      `${era}. гаражи, фестивали`,
    );
  }

  if (g.includes('electronic') || g.includes('house') || g.includes('techno') || g.includes('dance')) {
    return personaForYear(
      'клубный меломан',
      'ритмичные короткие фразы, лексика диджейской культуры, ночная интонация',
      `${era}. диджейские стыки, сэмплы, клубная сцена`,
    );
  }

  if (g.includes('hip hop') || g.includes('rap')) {
    return personaForYear(
      locale.countryCode === 'RU' ? 'фанат российского рэпа' : 'фанат хип-хоп культуры',
      locale.countryCode === 'RU'
        ? 'потоковая речь, студийный и уличный контекст, прямой тон'
        : 'потоковая речь, уличный контекст, прямой тон',
      era,
    );
  }

  if (g.includes('country') || title.toLowerCase().includes('кантри')) {
    return personaForYear(
      locale.countryCode === 'RU' ? `меломан ${artist}, российская кантри-сцена` : `меломан ${artist}`,
      locale.countryCode === 'RU'
        ? 'живая разговорная речь, российские студии и площадки'
        : 'живая разговорная речь, уважение к эпохе трека',
      era,
    );
  }

  if (g.includes('pop') || a.includes('beatles') || a.includes('abba')) {
    return personaForYear(
      'меломан поп-культуры',
      'ностальгический тон, контекст радио и телевидения эпохи',
      `${era}. телевидение, магнитофоны, кассеты`,
    );
  }

  return personaForYear(
    `меломан ${artist}`,
    'живая разговорная речь, уважение к эпохе трека, без энциклопедичности',
    era,
  );
}

export function buildSystemPrompt(
  persona: StoryPersona,
  length: StoryLengthPreset,
  storyLanguage: StoryLanguageId = DEFAULT_STORY_LANGUAGE,
  options: { speakTrackNamesInVoiceover?: boolean; artist?: string; title?: string } = {},
): string {
  if (storyLanguage === 'en') {
    return buildEnglishSystemPrompt(persona, length);
  }
  const durationHint = length.targetSeconds
    ? `~${length.targetSeconds} секунд речи`
    : 'развёрнутый рассказ без жёсткого лимита';

  const formatBlock = persona.formatRules
    ? persona.formatRules
    : 'Факт из семени → одна живая деталь → короткий вывод. Без шаблонных зачинов.';

  const focusBlock = persona.contentFocus
    ? `ФОКУС: ${persona.contentFocus}`
    : 'Контраст и интерес — через конкретику из семени, не через воду';

  const lengthPlan = buildLengthStructurePlan(length);
  const narratorBlock = persona.narratorAddendum
    ? `\n${persona.narratorAddendum}\n`
    : '';
  const noNames = isVoiceoverWithoutTrackNames(options.speakTrackNamesInVoiceover);
  const artist = options.artist?.trim() ?? '';
  const title = options.title?.trim() ?? '';
  const namesBlock =
    noNames && artist
      ? `\n${buildVoiceoverNoNamesPromptBlock(artist, title)}\n`
      : '';
  const latinRule = noNames
    ? '- В script НЕ вставляй имя артиста и название трека — см. блок «ОЗВУЧКА БЕЗ ИМЁН».'
    : '- Латиница в тексте — только: имя артиста, название трека БЕЗ кавычек (просто Smooth, In The Shadows), устоявшиеся термины (moonwalk, anti-gravity lean, Billboard). Иначе — БРАК, перепиши.';
  const langRule = noNames
    ? RUSSIAN_LANGUAGE_NO_NAMES_OVERRIDE
    : 'ЯЗЫК: русский. Английский/latin — имя артиста, название трека без кавычек и без «», устоявшиеся термины (moonwalk и т.п.).';

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
- ПЕРВАЯ ФРАЗА ОБЯЗАТЕЛЬНО: минимум один конкретный якорь из семени (событие/имя/чарт/платформа).
${latinRule}
- Если длина меньше минимума для выбранной длительности — БРАК, дополни фактами из того же семени.
${namesBlock}
${FACT_HUNT_PROMPT_BLOCK}

ВАЖНО ПРО АМПЛУА:
- Амплуа влияет ТОЛЬКО на тон, голос, ритм и подачу.
- Амплуа НЕ ИМЕЕТ ПРАВА менять или подменять фактическое содержание.
- Если стиль амплуа конфликтует с семенем — побеждает семя.

${lengthPlan}

${PERSONA_STYLE_DISCIPLINE}

КАТЕГОРИЧЕСКИ НЕЛЬЗЯ:
- «изначально называлась», «группа из…», состав, дискография.
- Перечисление рекламы, саундтреков, игр, фильмов.
- Generic-студия: «помогаюсь», «команда работает над треком».

${langRule}

${noNames ? RUSSIAN_LANGUAGE_NO_NAMES_OVERRIDE : RUSSIAN_LANGUAGE_PROMPT_BLOCK}

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
  selectedReferenceFact?: { fact: string; scope: 'artist' | 'track' | 'album'; scopeLabelRu: string };
  rawSnippets?: string[];
  artistTier?: 'major' | 'indie';
  storyLanguage?: StoryLanguageId;
  speakTrackNamesInVoiceover?: boolean;
}): string {
  if (params.storyLanguage === 'en') {
    return buildEnglishStoryUserPrompt(params);
  }
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
  const grammar = resolveArtistGrammarRu(params.artist);
  const noNames = isVoiceoverWithoutTrackNames(params.speakTrackNamesInVoiceover);
  const lines: string[] = noNames
    ? [
        `Контекст (НЕ вставляй в script): артист «${params.artist}», трек «${params.title}»`,
        `ГРАММАТИКА: ${grammar.promptHint}`,
        '',
        buildVoiceoverNoNamesPromptBlock(params.artist, params.title),
      ]
    : [
        `Артист: ${params.artist}`,
        `Трек: ${params.title}`,
        `ГРАММАТИКА: ${grammar.promptHint}`,
      ];

  if (params.genre) lines.push(`Жанр: ${params.genre}`);
  lines.push(`Страна/сцена: ${locale.countryLabelRu}`);
  lines.push(`Год релиза (только для тебя, НЕ писать цифры в script): ${locale.yearLabelRu}`);

  if (params.artistTier === 'indie') {
    lines.push('');
    lines.push(
      'НЕЗАВИСИМЫЙ АРТИСТ — мало публичных данных. Только факты из списка ниже. ' +
        'ЗАПРЕЩЕНО выдумывать лейблы, бизнес-проекты, компании, коллаборации, награды, ' +
        'если их нет в семени. Можно честно рассказать про жанр, год, страну и трек.',
    );
  }
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
    'Амплуа = только тон и формат. СОДЕРЖАНИЕ берётся строго из семени факта.',
  );
  const styleBlock = buildStylePromptBlock({
    narratorId,
    lang: params.storyLanguage ?? 'ru',
    genre: params.genre,
    year: params.year,
    seedFact: params.selectedReferenceFact?.fact,
  });
  if (styleBlock) {
    lines.push('');
    lines.push(styleBlock);
  }
  lines.push('Запрещено: менять или украшать факт ради стиля амплуа.');
  lines.push(
    'ЗАПРЕЩЕНО выдумывать социальные/политические темы (расизм, дискриминация, «равенство и справедливость») — только если это ЕСТЬ в семени.',
  );
  lines.push(`ЖЁСТКАЯ ДЛИНА: ${length.wordsMin}–${length.wordsMax} слов (${length.labelRu}).`);
  lines.push('Если меньше минимума слов — продолжи историю конкретикой из того же seed-факта.');
  lines.push(buildLengthStructurePlan(length));
  lines.push('В script — никаких цифр и годов, кроме цифр из имени артиста или названия трека.');
  lines.push(
    'Не перечисляй годы альбомов, сериалов и релизов списком — максимум один временной ориентир словами («в те годы», «позже»).',
  );

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
    lines.push('3. ФИНАЛ — одна короткая фраза-вывод из семени (конкретно, без шоу-клише).');
    lines.push('ЖИВАЯ РЕЧЬ: факт — напрямую («продажи выросли»), не «я слышал, как…». Хит — в чарте; в памяти трек остаётся, не «хит в памяти».');
    lines.push('ЗАПРЕЩЕНО в тексте для озвучки: «разорвал кабину», «разорвёт кабину» и любые варианты — это служебная метафора, не цитировать.');
    lines.push('НЕ: «мало кто знает», «легенда», «зал славы», «трогает сердца», перевод названия.');
    lines.push('НЕ ВЫДУМЫВАЙ: запах сигарет/кофе, «скрытый смысл — свобода», «зрители сходили с ума» — только если это ЕСТЬ в семени.');
    lines.push('Не обрывай фразы: «своих», «своего» — всегда с существительным («своих денег», «из своего кармана»).');
    lines.push('Не пиши «своих собственных» — достаточно «собственных денег» или «из своего кармана».');
    lines.push('НЕ ВЫДУМЫВАЙ: запрет на радио, «политически неправильная», двойная сессия, сотни дублей — только если это ЕСТЬ в семени.');
    lines.push(
      noNames
        ? 'ПЕРВАЯ фраза: якорь из семени (событие/платформа/чарт/число словами) — БЕЗ имени артиста и трека из метаданных.'
        : 'ПЕРВАЯ фраза обязана содержать минимум один якорь из семени: имя/событие/платформа/чарт/число словами.',
    );
    lines.push('Если в тексте нет якоря из семени — ответ считается браком.');
    if (narratorId === 'contemporary') {
      lines.push(
        'Для СОВРЕМЕННИКА: от первого лица (я/мы), ностальгический тон эпохи релиза; впечатления времени — из семени, без выдуманной студии/съёмок.',
      );
      lines.push('СОВРЕМЕННИК: факты напрямую — «продажи выросли», не «я слышал, как продажи выросли».');
      lines.push(
        'СОВРЕМЕННИК: год пиши «в начале 2010 года», без лишнего «тогда» рядом с годом; не «зациклили трек» — «гоняли по кругу» или «включали на повторе».',
      );
    }
    if (narratorId === 'fan') {
      lines.push(
        'Для ФАНАТА: от первого лица, восторженный тон; обожание артиста + коллекционные детали только из семени.',
      );
      lines.push(
        'ФАНАТ: деньги/инвестиции из семени — это артист («он вложил», «Jackson вложил»), не «я вложил полмиллиона».',
      );
    }
    if (narratorId === 'expert') {
      lines.push('Для ЭКСПЕРТА: явно назови жанр/поджанр трека и объясни механику жанра через seed-факт.');
    }
    lines.push('ОБЯЗАТЕЛЬНО: минимум два смысловых якоря из семени (имя, место, событие, скандал — переведи на русский).');
    lines.push(noNames ? RUSSIAN_LANGUAGE_NO_NAMES_OVERRIDE : RUSSIAN_LANGUAGE_PROMPT_BLOCK);
  } else if (facts.length > 0) {
    lines.push('');
    lines.push(FACT_HUNT_PROMPT_BLOCK);
    lines.push('');
    lines.push('СЕМЕНА ИСТОРИЙ (выбери ОДНО с максимальным контрастом — не рекламу и не дискографию):');
    facts.forEach((fact, i) => lines.push(`${i + 1}. ${fact}`));
  } else if ((params.rawSnippets?.length ?? 0) > 0) {
    lines.push('');
    lines.push(FACT_HUNT_PROMPT_BLOCK);
    lines.push('');
    lines.push(
      'СЫРЫЕ СНИППЕТЫ ИЗ ИСТОЧНИКОВ (Wikipedia, MusicBrainz, DuckDuckGo). В ЭТОМ ЖЕ ОТВЕТЕ:',
    );
    lines.push('1) выбери ОДНО проверяемое семя с контрастом (только из сниппетов, без выдумки);');
    lines.push('2) напиши историю, жёстко привязанную к этому семени.');
    const snippets = params.rawSnippets!.slice(0, 14);
    snippets.forEach((s, i) => {
      const trimmed = s.length > 420 ? `${s.slice(0, 420)}…` : s;
      lines.push(`${i}. ${trimmed}`);
    });
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
  const voiceHint = voiceStoryPromptHint(params.voiceId);
  if (voiceHint) lines.push(voiceHint);
  lines.push('Ответ в JSON.');

  return lines.join('\n');
}

const LOCAL_FACT_GROUNDING = `ФАКТЫ (жёстко, локальная модель):
- Содержание — ТОЛЬКО из списка «Проверенные факты». Не добавляй события, людей и детали.
- Амплуа меняет тон, ритм и структуру фраз — НЕ содержание факта.
- ЗАПРЕЩЕНО (вода/выдумка): бунт, легенда, шедевр, безумие, взрыв, «не просто трек/песня/рок», «вызов правилам», «сломал правила», «мы на концерте», «представь себе», «сотни дублей», «запретили эфир», «чистая эмоция», «изменил музыку навсегда».
- Не выдумывай студию, драму, реакцию зала, если этого нет в фактах.`;

export function buildLocalSystemPrompt(
  persona: StoryPersona,
  length: StoryLengthPreset,
  options: { speakTrackNamesInVoiceover?: boolean; artist?: string; title?: string } = {},
): string {
  const durationHint = length.targetSeconds
    ? `~${length.targetSeconds} секунд речи`
    : 'развёрнутый рассказ';

  const formatBlock = persona.formatRules ?? 'Факт из списка → живая подача в стиле персонажа → короткий вывод.';
  const focusBlock = persona.contentFocus ? `ФОКУС: ${persona.contentFocus}` : '';
  const narratorBlock = persona.narratorAddendum ? `\n${persona.narratorAddendum}\n` : '';
  const noNames = isVoiceoverWithoutTrackNames(options.speakTrackNamesInVoiceover);
  const namesBlock =
    noNames && options.artist?.trim()
      ? `\n${buildVoiceoverNoNamesPromptBlock(options.artist, options.title ?? '')}\n`
      : '';

  return `Ты пишешь текст для ОЗВУЧКИ — локальная модель Ollama: проверенные факты + амплуа персонажа.

РОЛЬ: ${persona.roleTitle}
ЭПОХА: ${persona.eraHint}
ГОЛОС: ${persona.speechStyle}
${focusBlock}
${narratorBlock}
${PERSONA_STYLE_DISCIPLINE}

ФОРМАТ: ${formatBlock}

${LOCAL_FACT_GROUNDING}
${namesBlock}
${noNames ? RUSSIAN_LANGUAGE_NO_NAMES_OVERRIDE : RUSSIAN_LANGUAGE_PROMPT_BLOCK}

ЧИСЛА: без арабских цифр в script (кроме цифр в имени/названии). Длительность и год — словами, если есть в фактах.

ЖЁСТКИЙ ОБЪЁМ: ${length.wordsMin}–${length.wordsMax} слов (${durationHint}). ${length.sentenceHint}.
- word_count в JSON — строго в этом диапазоне.

JSON: {"script":"...", "word_count": число, "voiceId": "alena | filipp | ermil | jane | omazh | zahar | marina | dasha | julia | kirill | masha | alexander | lera"}`;
}

export function buildLocalStoryUserPrompt(params: {
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
  selectedReferenceFact?: { fact: string; scope: 'artist' | 'track' | 'album'; scopeLabelRu: string };
  speakTrackNamesInVoiceover?: boolean;
}): string {
  const narratorId = resolveStoryNarrator(params.storyNarrator);
  const persona = buildPersonaForNarrator(
    narratorId,
    params.year,
    params.genre,
    params.artist,
    params.title,
    params.countryCode,
  );
  const length = getStoryLengthPreset(params.storyLength);
  const noNames = isVoiceoverWithoutTrackNames(params.speakTrackNamesInVoiceover);
  const lines: string[] = noNames
    ? [
        `Контекст (НЕ вставляй в script): артист «${params.artist}», трек «${params.title}»`,
        '',
        buildVoiceoverNoNamesPromptBlock(params.artist, params.title),
      ]
    : [`Артист: ${params.artist}`, `Трек: ${params.title}`];
  if (params.genre) lines.push(`Жанр: ${params.genre}`);
  if (params.year) lines.push(`Год релиза (для контекста, в script — словами): ${params.year}`);
  lines.push('');
  lines.push(`Ты — ${persona.roleTitle}. Говоришь так: ${persona.speechStyle}`);
  if (narratorId !== 'auto') {
    const preset = getNarratorPreset(narratorId);
    if (preset) {
      lines.push(`РАССКАЗЧИК (АМПЛУА): ${preset.labelRu} — ${preset.descriptionRu}`);
      lines.push(preset.promptAddendum);
    }
  }
  lines.push('Амплуа = тон и подача. СОДЕРЖАНИЕ — строго из списка фактов.');
  lines.push(`Длина: ${length.wordsMin}–${length.wordsMax} слов.`);

  const facts = params.referenceFacts?.filter(Boolean) ?? [];
  const selected = params.selectedReferenceFact;
  if (selected) {
    lines.push('');
    lines.push(`Главный факт (${selected.scopeLabelRu}): ${selected.fact}`);
  }
  if (facts.length > 0) {
    lines.push('');
    lines.push('Проверенные факты (используй ТОЛЬКО их, по одному на предложение):');
    facts.forEach((fact, i) => lines.push(`${i + 1}. ${fact}`));
  }

  if (params.retryReason) {
    lines.push('');
    lines.push(`ПРЕДЫДУЩИЙ ОТВЕТ ОТКЛОНЁН: ${params.retryReason}`);
    lines.push('Перепиши полностью: только факты из списка, без драмы и без запрещённых слов.');
  }

  const prev = params.previousScripts?.filter(Boolean) ?? [];
  if (prev.length > 0) {
    lines.push('');
    lines.push('Уже рассказано — другой факт из списка:');
    prev.slice(0, 5).forEach((s, i) => {
      const snippet = s.length > 200 ? `${s.slice(0, 200)}…` : s;
      lines.push(`${i + 1}. ${snippet}`);
    });
  }

  lines.push('');
  lines.push(`Голос (voiceId): ${params.voiceId}`);
  const localVoiceHint = voiceStoryPromptHint(params.voiceId);
  if (localVoiceHint) lines.push(localVoiceHint);
  lines.push('Ответ в JSON.');
  return lines.join('\n');
}
