export interface StoryPersona {
  roleTitle: string;
  speechStyle: string;
  eraHint: string;
}

export const STORY_ANGLES = [
  'скрытая деталь записи или продакшена',
  'культурный контекст эпохи, что происходило вокруг',
  'одержимость фаната этим артистом и его стилем',
  'концерт, клуб, репетиция, живое выступление',
  'смысл, который не слышат при беглом прослушивании',
  'история из закулисья жанра или сцены',
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

  if (a.includes('elvis')) {
    return personaForYear(
      y,
      `фанат rock'n'roll и soul ${y}-х, коллекционирует синглы Elvis`,
      'речь 50–70-х: «слушай», «вот что», уважение к King, без сленга другой эпохи',
      'Телевизионные шоу, RCA Studio, Las Vegas, реакция зала',
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
      `Америка ${y}-х, винил, расовые барьеры, живое радио`,
    );
  }

  if (g.includes('blues') || g.includes('soul')) {
    return personaForYear(
      y,
      `блюзовый меломан ${y}-х`,
      'лексика soul/blues: «слушай», «child», исповедь, ночной клуб',
      'юг США или городской клуб',
    );
  }

  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) {
    return personaForYear(
      y,
      `рок-фанат ${y}-х`,
      'лексика rock: «вот что», «слушай сюда», концертный зал',
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
      'лексика dance: break, sample, бас, warehouse',
      'warehouse, диджейские стыки',
    );
  }

  if (g.includes('hip hop') || g.includes('rap')) {
    return personaForYear(
      y,
      `фанат хип-хопа ${y}-х`,
      'лексика rap: flow, block party, уличная честность',
      'битбокс, блок-вечеринки',
    );
  }

  if (g.includes('pop') || a.includes('beatles') || a.includes('abba')) {
    return personaForYear(
      y,
      `обожатель поп-культуры ${y}-х`,
      'лексика pop: «ты представляешь?», радио и TV',
      'телевидение, магнитофоны, кассеты',
    );
  }

  if (y < 1970) {
    return personaForYear(
      y,
      `современник ${y}-х, фанат ${artist}`,
      `лексика ${y}-х: винил, радио`,
      'мир до streaming',
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
      'лексика 2000-х: ремиксы, CD, «короче»',
      'интернет-форумы, ремиксы',
    );
  }

  return personaForYear(
    y,
    `фанат ${artist}`,
    'современная речь, уважение к эпохе трека',
    'архивы, ремастеры',
  );
}

export function buildSystemPrompt(persona: StoryPersona): string {
  return `Ты говоришь ОТ ПЕРВОГО ЛИЦА — не ведущий приложения, не диджей радио.

ТВОЯ РОЛЬ: ${persona.roleTitle}
ЛЕКСИКА ЭПОХИ (строго): ${persona.speechStyle}
КОНТЕКСТ: ${persona.eraHint}

Ты — современник года выхода трека И фанат этого жанра и исполнителя.
Один конкретный факт, курьёз или закулисье — не общие слова про «душу» и «магию музыки».

ЗАПРЕЩЕНО:
- «братуха», «братан», «чувак» — если это не лексика указанной эпохи
- «Music Story», «сейчас в эфире», «на волнах», «добро пожаловать»
- вода: «вкладывает душу», «магия музыки», «врубай громче», «не пожалеешь»
- Wikipedia-сухость, реклама, ремарки в скобках
- повторять факты из «УЖЕ РАССКАЗАНО»

НУЖНО:
- 55–65 слов (~30 сек), короткие фразы
- лексика только из эпохи трека
- один сильный инсайт или прикол

Формат — строго JSON:
{"script":"...", "word_count": число, "voiceId": "marina | filipp | jane | alena | omazh"}`;
}

export function buildStoryUserPrompt(params: {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  voiceId: string;
  angle: string;
  previousScripts?: string[];
}): string {
  const persona = personaForTrack(params.year, params.genre, params.artist);
  const lines: string[] = [
    `Артист: ${params.artist}`,
    `Трек: ${params.title}`,
  ];

  if (params.year) lines.push(`Год выхода (ориентир): ${params.year}`);
  if (params.genre) lines.push(`Жанр: ${params.genre}`);

  lines.push('');
  lines.push(`УГОЛ: ${params.angle}`);
  lines.push(`Говори как ${persona.roleTitle}, лексика: ${persona.speechStyle}`);
  lines.push('');

  const prev = params.previousScripts?.filter(Boolean) ?? [];
  if (prev.length > 0) {
    lines.push('УЖЕ РАССКАЗАНО — другой факт и другой заход:');
    prev.slice(0, 5).forEach((s, i) => {
      const snippet = s.length > 200 ? `${s.slice(0, 200)}…` : s;
      lines.push(`${i + 1}. ${snippet}`);
    });
  } else {
    lines.push('Первый рассказ про этот трек — сразу с сильного факта.');
  }

  lines.push('');
  lines.push(`Рекомендуемый голос (voiceId): ${params.voiceId}`);
  lines.push('Ответ в JSON.');

  return lines.join('\n');
}
