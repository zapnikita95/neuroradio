import { StoryScript } from './groq.js';
import { personaForTrack } from './prompts.js';
import { voiceForYear, YandexVoiceId } from './voices.js';

function artistFact(artist: string, title: string, year: number): string | null {
  const a = artist.toLowerCase();
  const t = title.toLowerCase();
  if (a.includes('elvis') && (t.includes('jxl') || t.includes('little less'))) {
    return (
      'В 2002 JXL вытащил из архива RCA demo 1968 года, наложил breakbeat — ' +
      'и Elvis снова в чартах через четверть века. Без ремикса многие не знали оригинал.'
    );
  }
  if (a.includes('elvis')) {
    return (
      `Elvis в ${year}-м ломал формат: «${title}» записывали как шоу для TV, не как сессию — ` +
      'реакция зала важнее чартов.'
    );
  }
  return null;
}

function buildAngleScript(
  artist: string,
  title: string,
  year: number,
  angleIndex: number,
  persona: ReturnType<typeof personaForTrack>,
): string {
  const custom = artistFact(artist, title, year);
  const opener = persona.speechStyle.includes('rock')
    ? 'Вот что,'
    : persona.speechStyle.includes('джаз') || persona.speechStyle.includes('jazz')
      ? 'Dig this,'
      : 'Слушай,';
  if (custom) return `${opener} ${custom}`;

  const templates = [
    `В ${year} году при записи «${title}» оставили дубль с ошибкой — тот срыв стал фирменным моментом.`,
    `${year}-й: ${persona.eraHint}. «${title}» от ${artist} — не фон, а газета улицы.`,
    `Я собираю всё на ${artist}. «${title}» (${year}) каждый раз даёт новую деталь в live-версии.`,
    `На шоу ${year} года ${artist} вышел с «${title}» — зал замолчал на первой ноте, потом взорвался.`,
    `«${title}» звучит просто, но ${persona.roleTitle.split(',')[0]} слышит второй слой настроения ${year}-го.`,
    `В ${year}-м шептались: ${artist} и «${title}» — спор в кулуарах, не просто сингл.`,
  ];
  return `${opener} ${templates[angleIndex % templates.length]}`;
}

function isTooSimilar(candidate: string, previous: string[]): boolean {
  const c = candidate.toLowerCase();
  return previous.some((prev) => {
    const p = prev.toLowerCase();
    return p === c || p.slice(0, 80) === c.slice(0, 80);
  });
}

export function buildDemoStory(
  artist: string,
  title: string,
  year?: number,
  genre?: string,
  previousScripts: string[] = [],
): StoryScript {
  const voiceId: YandexVoiceId = voiceForYear(year, genre);
  const eraYear = year ?? 1968;
  const persona = personaForTrack(year, genre, artist);
  let angleIndex = previousScripts.length;

  for (let attempt = 0; attempt < 6; attempt++) {
    const script = buildAngleScript(
      artist,
      title,
      eraYear,
      angleIndex + attempt,
      persona,
    );
    if (!isTooSimilar(script, previousScripts)) {
      return {
        script,
        word_count: script.trim().split(/\s+/).filter(Boolean).length,
        voiceId,
      };
    }
  }

  const fallback = buildAngleScript(artist, title, eraYear, 0, persona);
  return {
    script: fallback,
    word_count: fallback.trim().split(/\s+/).filter(Boolean).length,
    voiceId,
  };
}

/** Demo templates when Groq key is missing. Yandex is optional (Android TTS fallback). */
export function isDemoMode(): boolean {
  return !Boolean(process.env.GROQ_API_KEY?.trim());
}
