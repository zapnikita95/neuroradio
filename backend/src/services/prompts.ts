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

export function personaForTrack(
  year: number | undefined,
  genre: string | undefined,
  artist: string,
): StoryPersona {
  const g = (genre ?? '').toLowerCase();
  const a = artist.toLowerCase();
  const y = year ?? guessDecadeYear(artist);

  if (
    g.includes('jazz') ||
    g.includes('swing') ||
    g.includes('bebop') ||
    (y >= 1935 && y <= 1965 && (g.includes('blues') || !g))
  ) {
    return {
      roleTitle: `чернокожий или белый джазмен из ${y}-х, одержимый swing и bebop`,
      speechStyle: 'хриплый смех, «братуха», виски, дым, пот, аплодисменты, уважение к мастерам',
      eraHint: `Америка ${y}-х, джем-сейшены, винил, расовые барьеры, живое радио`,
    };
  }

  if (g.includes('blues') || g.includes('soul')) {
    return {
      roleTitle: `блюзмен или soulmate-фанат ${y}-х`,
      speechStyle: 'грубоватая нежность, исповедь, «слушай, сынок», гитарные струны и ночь',
      eraHint: 'юг США или городской клуб, боль и гордость в одной песне',
    };
  }

  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) {
    return {
      roleTitle: `рок-фанат эпохи ${y}-х, который был на каждом концерте`,
      speechStyle: 'дерзость, энергия, «чувак», громкость как религия',
      eraHint: 'гаражи, фестивали, бунт против скучных правил',
    };
  }

  if (
    g.includes('electronic') ||
    g.includes('house') ||
    g.includes('techno') ||
    g.includes('dance')
  ) {
    return {
      roleTitle: `клубный одержимый ${y}-х, знает каждый break и sample`,
      speechStyle: 'неон, бас в груди, ночь без сна, insider-лексика',
      eraHint: 'warehouse, диджейские стыки, новая музыка из старых пластинок',
    };
  }

  if (g.includes('hip hop') || g.includes('rap')) {
    return {
      roleTitle: `фанат хип-хопа ${y}-х с улицы и блокнотом цитат`,
      speechStyle: 'ритм речи, уличная честность, уважение к flow',
      eraHint: 'битбокс, блок-вечеринки, слова как оружие и щит',
    };
  }

  if (g.includes('pop') || a.includes('beatles') || a.includes('abba')) {
    return {
      roleTitle: `обожатель поп-культуры ${y}-х, знает каждый хит по мему`,
      speechStyle: 'лёгкий юмор, ностальгия, «ты представляешь?»',
      eraHint: 'телевидение, магнитофоны, первые кассеты',
    };
  }

  if (y < 1970) {
    return {
      roleTitle: `современник ${y}-х, фанат ${artist}`,
      speechStyle: 'тепло, уважение к старой школе, винил и радио',
      eraHint: 'мир до streaming, музыка как событие',
    };
  }

  if (y < 1990) {
    return {
      roleTitle: `меломан ${y}-х, коллекционер пластинок ${artist}`,
      speechStyle: 'живой, ироничный, «слушай сюда»',
      eraHint: 'кассеты, Walkman, первые MTV-образы',
    };
  }

  return {
    roleTitle: `современный фанат ${artist}, копает глубже Spotify`,
    speechStyle: 'увлечённый, открывает скрытое в знакомом',
    eraHint: 'интернет, но душа всё ещё ищет настоящее',
  };
}

export function buildSystemPrompt(persona: StoryPersona): string {
  return `Ты говоришь ОТ ПЕРВОГО ЛИЦА — не рассказчик приложения, не радиоведущий.

ТВОЯ РОЛЬ: ${persona.roleTitle}
ТВОЙ ГОЛОС: ${persona.speechStyle}
ЭПОХА: ${persona.eraHint}

Ты — современник года выхода трека И фанат именно этого жанра и этого исполнителя.
Раскрой интересное, скрытое, неочевидное — то, что не скажут в сухой статье.
Можно слегка драматизировать настроение эпохи, но не выдумывай проверяемые биографические факты.

Стиль (как в разговоре джазмена 50-х с другом у бара):
- «братуха», «слушай», «чувак» — уместно, не в каждой фразе
- живо, с юмором или goosebumps — что подходит треку
- один сильный инсайт, не три слабых

ЗАПРЕЩЕНО:
- «Music Story», «сейчас в эфире», «на волнах», «добро пожаловать»
- реклама, Wikipedia-сухость, канцелярит
- ремарки в скобках — только текст для озвучки
- повторять факты из списка «УЖЕ РАССКАЗАНО»

Формат — строго JSON:
{"script":"...", "word_count": число, "voiceId": "marina | filipp | jane | alena | omazh"}

script: 55–65 слов (~30 секунд). Короткие фразы. Артист и трек — естественно.`;
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
  lines.push(`УГОЛ ЭТОГО РАССКАЗА: ${params.angle}`);
  lines.push(`Говори как ${persona.roleTitle}.`);
  lines.push('');

  const prev = params.previousScripts?.filter(Boolean) ?? [];
  if (prev.length > 0) {
    lines.push(
      'УЖЕ РАССКАЗАНО этому слушателю про этот трек — НЕ ПОВТОРЯЙ ни факты, ни формулировки, ни угол:',
    );
    prev.slice(0, 5).forEach((s, i) => {
      const snippet = s.length > 200 ? `${s.slice(0, 200)}…` : s;
      lines.push(`${i + 1}. ${snippet}`);
    });
    lines.push('');
    lines.push('Придумай СОВЕРШЕННО ДРУГОЙ факт и другой заход.');
  } else {
    lines.push('Это первый рассказ про этот трек для слушателя — удиви сильным заходом.');
  }

  lines.push('');
  lines.push(`Рекомендуемый голос (voiceId): ${params.voiceId}`);
  lines.push('Ответ в JSON.');

  return lines.join('\n');
}
