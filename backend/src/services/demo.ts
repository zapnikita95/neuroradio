import { StoryScript } from './groq.js';
import { personaForTrack } from './prompts.js';
import { voiceForYear, YandexVoiceId } from './voices.js';

const LOCAL_ANGLES = [
  (artist: string, title: string, year: number, persona: ReturnType<typeof personaForTrack>) =>
    `Слушай, братуха… «${title}» от ${artist} — это ${year}-й, и тут есть секрет: на записи слышно не только ноты — слышно, как ${persona.roleTitle.split(',')[0]} вкладывает душу. Микрофон ловит вздох между тактами — и вот этот вздох стоит слушать снова. Врубай громче.`,

  (artist: string, title: string, year: number, persona: ReturnType<typeof personaForTrack>) =>
    `О-о-о, ${year} год… «${title}», ${artist}. Представь: ${persona.eraHint}. Люди ещё не листают ленту — они живут в моменте, и эта пластинка как газета того дня. Слушай не фоном — слушай как современник.`,

  (artist: string, title: string, year: number, persona: ReturnType<typeof personaForTrack>) =>
    `Братуха, я фанат ${artist} с тех пор, как впервые услышал «${title}». Это ${year}, ${persona.speechStyle.slice(0, 60)}… Каждый раз ловлю новую деталь — фразу, паузу, огонь. Вот ради таких моментов и копаешь музыку до дна.`,

  (artist: string, title: string, year: number, persona: ReturnType<typeof personaForTrack>) =>
    `Чувак, «${title}» — это не студийная картинка, это зал ${year} года. ${artist} выходит — и воздух меняется. Даже на записи чувствуешь, как пол под ногами дрожит. Закрой глаза — ты в первом ряду.`,

  (artist: string, title: string, year: number, persona: ReturnType<typeof personaForTrack>) =>
    `Слушай внимательно: «${title}» от ${artist} — ${year}. С первого раза кажется простым, а на самом деле там второй слой — настроение эпохи, которое ${persona.roleTitle} понимает без слов. Музыка говорит то, что люди боялись сказать вслух.`,

  (artist: string, title: string, year: number, persona: ReturnType<typeof personaForTrack>) =>
    `Братуха, на сцене ${year} года шептались: ${artist} с «${title}» — это не просто хит, это разговор всей тусовки. ${persona.eraHint}. Кто-то спорил до драки, кто-то плакал от красоты. А мы просто включаем — и снова там, где всё начиналось.`,
];

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
  const voiceId: YandexVoiceId = voiceForYear(year);
  const eraYear = year ?? 1958;
  const persona = personaForTrack(year, genre, artist);
  let angleIndex = previousScripts.length;

  for (let attempt = 0; attempt < LOCAL_ANGLES.length; attempt++) {
    const idx = (angleIndex + attempt) % LOCAL_ANGLES.length;
    const script = LOCAL_ANGLES[idx](artist, title, eraYear, persona);

    if (!isTooSimilar(script, previousScripts)) {
      return {
        script,
        word_count: script.trim().split(/\s+/).filter(Boolean).length,
        voiceId,
      };
    }
  }

  const fallback = LOCAL_ANGLES[0](artist, title, eraYear, persona);
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
