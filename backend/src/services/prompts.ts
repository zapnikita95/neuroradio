import { getStoryLengthPreset, StoryLengthId } from './story-length.js';
import type { StoryLengthPreset } from './story-length.js';

export interface StoryPersona {
  roleTitle: string;
  speechStyle: string;
  eraHint: string;
}

export const STORY_ANGLES = [
  'конкретная сцена записи или студийный курьёз',
  'где ты был, когда впервые услышал этот трек',
  'живое выступление — что видел своими глазами',
  'закулисье: кто спорил, что ломалось, что удивило',
  'деталь, которую фанаты замечают не с первого раза',
  'история из тусовки жанра в тот сезон',
] as const;

function guessDecadeYear(artist: string): number {
  let hash = 0;
  for (let i = 0; i < artist.length; i++) {
    hash = (hash * 31 + artist.charCodeAt(i)) >>> 0;
  }
  return 1955 + (hash % 40);
}

export function pickAngle(previousCount: number): string {
  return STORY_ANGLES[previousCount % STORY_ANGLES.length];
}

function personaForYear(
  year: number,
  role: string,
  speech: string,
  era: string,
): StoryPersona {
  return { roleTitle: role, speechStyle: speech, eraHint: era };
}

export function personaForTrack(
  year: number | undefined,
  genre: string | undefined,
  artist: string,
): StoryPersona {
  const g = (genre ?? '').toLowerCase();
  const a = artist.toLowerCase();
  const y = year ?? guessDecadeYear(artist);

  if (a.includes('james brown') || g.includes('funk')) {
    return personaForYear(
      y,
      `парень из Harlem, soul/funk ${y}-х, ходит на Apollo и знает каждый scream Brown`,
      'речь mid-60s soul: короткие рваные фразы, «man», «look», «that night», энергия сцены',
      'Apollo Theater, одно дубль, cape routine, James Brown Show',
    );
  }

  if (a.includes('elvis')) {
    return personaForYear(
      y,
      `фанат rock'n'roll ${y}-х, собирает синглы Elvis`,
      'речь 50–70-х: «помню», «тогда», «King», без современного сленга',
      'RCA Studio, TV Specials, реакция зала, Sun Records в памяти старших',
    );
  }

  if (
    g.includes('jazz') ||
    g.includes('swing') ||
    g.includes('bebop') ||
    (y >= 1935 && y <= 1965 && (g.includes('blues') || !g))
  ) {
    return personaForYear(
      y,
      `джазмен ${y}-х, одержим swing и bebop`,
      'лексика 40–60-х: «cat», «man», «dig this», джем-сейшены',
      `Америка ${y}-х, джем-сейшены, винил, расовые барьеры, живое радио`,
    );
  }

  if (g.includes('blues') || g.includes('soul')) {
    return personaForYear(
      y,
      `блюзовый меломан ${y}-х с юга или из клуба`,
      'лексика soul/blues: «child», «that night», исповедь, гитара, sweat',
      'ночной клуб, юг США, гордость и боль в одной песне',
    );
  }

  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) {
    return personaForYear(
      y,
      `рок-фанат ${y}-х, был на концертах`,
      'лексика rock: «that gig», «we were», громкость, бунт',
      'гаражи, фестивали, бунт против скучных правил',
    );
  }

  if (
    g.includes('electronic') ||
    g.includes('house') ||
    g.includes('techno') ||
    g.includes('dance')
  ) {
    return personaForYear(
      y,
      `клубный меломан ${y}-х`,
      'лексика dance: break, sample, bass, warehouse, ночь',
      'warehouse, диджейские стыки, новая музыка из старых пластинок',
    );
  }

  if (g.includes('hip hop') || g.includes('rap')) {
    return personaForYear(
      y,
      `фанат хип-хопа ${y}-х с блока`,
      'лексика rap: flow, block party, уличная честность',
      'битбокс, блок-вечеринки, слова как оружие и щит',
    );
  }

  if (g.includes('pop') || a.includes('beatles') || a.includes('abba')) {
    return personaForYear(
      y,
      `обожатель поп-культуры ${y}-х`,
      'лексика pop: «that summer», «on the radio», TV и магнитофоны',
      'телевидение, магнитофоны, первые кассеты',
    );
  }

  if (y < 1970) {
    return personaForYear(
      y,
      `современник ${y}-х, фанат ${artist}`,
      `лексика ${y}-х: винил, радио, «I remember»`,
      'мир до streaming, музыка как событие',
    );
  }

  if (y < 1990) {
    return personaForYear(
      y,
      `меломан ${y}-х, коллекционер ${artist}`,
      'лексика 80-х: кассеты, Walkman, MTV',
      'кассеты, Walkman, MTV',
    );
  }

  if (y < 2005) {
    return personaForYear(
      y,
      `фанат ${artist} нулевых`,
      'лексика 2000-х: ремиксы, CD, форумы',
      'интернет-форумы, ремиксы, первые mp3',
    );
  }

  return personaForYear(
    y,
    `фанат ${artist}`,
    'современная речь, но уважение к эпохе трека',
    'архивы, ремастеры, редкие live',
  );
}

export function buildSystemPrompt(persona: StoryPersona, length: StoryLengthPreset): string {
  const durationHint = length.targetSeconds
    ? `~${length.targetSeconds} секунд речи`
    : 'развёрнутый рассказ без жёсткого лимита';

  return `Ты пишешь текст для ОЗВУЧКИ — живой человек рассказывает историю другу.

КТО ТЫ: ${persona.roleTitle}
ГДЕ И КОГДА ТЫ ЖИВЁШЬ: ${persona.eraHint}
КАК ТЫ ГОВОРИШЬ: ${persona.speechStyle}

Ты фанат жанра и этого артиста. Ты БЫЛ там (или помнишь тот сезон) — рассказываешь из памяти, не из Wikipedia.

ФОРМАТ — живая мини-история от первого лица:
- Начинай СРАЗУ со сцены, действия или воспоминания: «Помню, как в Apollo...», «Тогда я стоял у радиолы...», «Мы в '68-м не понимали, что...»
- НЕ начинай с мета-фраз: «знаю факт», «интересно что», «вот что», «слушай факт», «я расскажу»
- НЕ обращайся к слушателю как ведущий — ты просто делишься воспоминанием

СОДЕРЖАНИЕ:
- Минимум ${length.wordsMin} слов, максимум ${length.wordsMax} (${durationHint})
- ${length.sentenceHint}, каждое с конкретикой: место, год, деталь студии/концерта/людей
- Один запоминающийся факт или курьёз — не общие слова про «зал сходит с ума» или «артист в огне»
- Если год трека неизвестен — не выдумывай точную дату, опирайся на эпоху
- Если в названии «remix», «JXL», «vs» — можно про ремикс ИЛИ оригинал, но точно и правдоподобно

ЗАПРЕЩЕНО:
- «братуха», «братан», «чувак» (если не эпоха)
- «Music Story», «сейчас в эфире», «на волнах»
- вода: «вкладывает душу», «магия музыки», «врубай громче», «зал сходит с ума», «в экстазе»
- скобки, ремарки, JSON внутри script

Пример ХОРОШО (не копируй): «Помню '65-й, Apollo — Brown ещё в раздевалке делал splits, а мы уже не дышали. I Got You сняли за один take, инженер говорил — микрофон еле остыл. Я кричал так, что на следующий день не мог говорить.»

Формат ответа — строго JSON:
{"script":"...", "word_count": число, "voiceId": "zahar | ermil | filipp | jane | alena | omazh | marina"}`;
}

export function buildStoryUserPrompt(params: {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  voiceId: string;
  angle: string;
  storyLength: StoryLengthId;
  previousScripts?: string[];
  retryReason?: string;
}): string {
  const persona = personaForTrack(params.year, params.genre, params.artist);
  const length = getStoryLengthPreset(params.storyLength);
  const lines: string[] = [
    `Артист: ${params.artist}`,
    `Трек: ${params.title}`,
  ];

  if (params.year) lines.push(`Год выхода (ориентир): ${params.year}`);
  if (params.genre) lines.push(`Жанр: ${params.genre}`);

  lines.push('');
  lines.push(`УГОЛ ИСТОРИИ: ${params.angle}`);
  lines.push(`Ты — ${persona.roleTitle}. Говоришь так: ${persona.speechStyle}`);
  lines.push(`Длина: ${length.wordsMin}–${length.wordsMax} слов. Живая история, не справка.`);

  if (params.retryReason) {
    lines.push('');
    lines.push(`ПРЕДЫДУЩИЙ ОТВЕТ ОТКЛОНЁН: ${params.retryReason}`);
    lines.push('Перепиши полностью: длиннее, конкретнее, без мета-зачинов.');
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
    lines.push('Первый рассказ — сразу погружай в сцену, без «знаю факт».');
  }

  lines.push('');
  lines.push(`Голос (voiceId): ${params.voiceId}`);
  lines.push('Ответ в JSON.');

  return lines.join('\n');
}
