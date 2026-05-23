import { StoryScript } from './groq.js';
import { buildPersonaForNarrator } from './prompts.js';
import { resolveStoryNarrator, StoryNarratorId } from './story-narrator.js';
import { voiceForYear, YandexVoiceId } from './voices.js';

const ANGLES = [
  'RECORDING',
  'FIRST_HEAR',
  'LIVE',
  'BACKSTAGE',
  'FAN',
  'GOSSIP',
] as const;

function buildNarratorScript(
  artist: string,
  title: string,
  narratorId: StoryNarratorId,
): string | null {
  switch (narratorId) {
    case 'auto':
      return null;
    case 'radio_host':
      return (
        `Слушайте — «${title}» от ${artist}. ` +
        'Один дубль в студии, инженер потом говорил, что микрофон еле остыл. ' +
        'Оставайтесь — дальше будет ещё интереснее.'
      );
    case 'contemporary':
      return (
        `Помню ту ночь — «${title}» вырвался из колонок, и я замер. ` +
        'Запах дыма, липкие ступени клуба, соседи стучали по батарее. ' +
        'С того вечера эта песня у меня в голове навсегда.'
      );
    case 'expert':
      return (
        `Суть «${title}» — не в громкости, а в том, как ${artist} держит ритм на одном дыхании. ` +
        'Мало кто замечает, как бас и ударные расходятся на полтона — именно здесь трек цепляет.'
      );
    case 'fan':
      return (
        `У меня три версии «${title}» — сингл, концертный дубль и оборот с другим аутро. ` +
        `Фанаты ${artist} знают: в live-версии другая фраза перед финалом. Я переслушиваю это каждый раз.`
      );
    case 'backstage':
      return (
        `За кулисами спорили до утра — пускать ли «${title}» таким, как записали. ` +
        `${artist} настоял на дубле с ошибкой. Продюсер потом признался: именно этот срыв и стал хитом.`
      );
    case 'night_dj':
      return (
        `Если ты ещё не спишь — «${title}» от ${artist}. ` +
        'Эту песню я кручу только после полуночи: город тихий, а в наушниках — как исповедь. ' +
        'Один раз в эфире я даже забыл включить следующий трек.'
      );
    default:
      return null;
  }
}

function buildAngleScript(
  artist: string,
  title: string,
  angleIndex: number,
  persona: ReturnType<typeof buildPersonaForNarrator>,
): string {
  const role = persona.roleTitle.split(',')[0].trim();
  const templates = [
    `Помню студию — при записи «${title}» ${artist} настоял оставить дубль с ошибкой. Тот срыв голоса стал фирменным моментом, инжен+ер потом говорил, что микрофон еле остыл.`,
    `Тогда я стоял у радиолы — «${title}» от ${artist} вылетел как удар. Соседи стучали по батарее, а мы не могли выключить, потому что ${persona.eraHint.split('.')[0]}.`,
    `На живом концерте ${artist} вышел с «${title}» — зал замолчал на первой ноте. Я стоял у мониторов, звукорежиссёры краснели от свиста в колонках, а потом зал взорвался.`,
    `За кулисами шептались: ${artist} и «${title}» — не просто сингл. Продюсеры спорили до утра, кто первым пустит такой звук в эфир, а ${role} уже знал — это изменит сезон.`,
    `Я собираю всё на ${artist} — концертные записи, интервью, обложки. «${title}» каждый раз даёт новую деталь: в живой версии другая фраза, на обороте сингла другой дубль.`,
    `На сцене шептались: ${artist} и «${title}» — спор в кулуарах, не просто хит. Я был там — помню запах дыма и то, как зал не дышал.`,
  ];
  return templates[angleIndex % templates.length];
}

function artistFact(artist: string, title: string): string | null {
  const a = artist.toLowerCase();
  const t = title.toLowerCase();
  if (a.includes('james brown') && t.includes('i got you')) {
    return (
      'Помню Apollo — Brown ещё в раздевалке делал шпагаты, а мы уже не дышали. «I Got You» сняли за один дубль, инженер говорил — микрофон еле остыл. ' +
      'Я кричал так, что на следующий день не мог говорить.'
    );
  }
  if (a.includes('james brown')) {
    return (
      `Той ночью в Apollo Brown вышел в плаще — сбросил, надел, сбросил снова. «${title}» — не просто песня, это ритуал. ` +
      'Мы знали каждый крик, каждый удар колена.'
    );
  }
  if (a.includes('elvis') && (t.includes('jxl') || t.includes('little less'))) {
    return (
      'JXL вытащил из архива RCA старую запись — оригинал «A Little Less Conversation» лежал мёртвым, пока бит не вернул Elvis в чарты. Я слушал обе версии подряд.'
    );
  }
  if (a.includes('elvis')) {
    return (
      `Elvis ломал формат — «${title}» записывали как телешоу, не как студийную сессию. Камеры ловили не только голос, но и реакцию зала.`
    );
  }
  if (a.includes('beatles')) {
    return (
      `На Abbey Road Beatles наслаивали дорожки на «${title}», соседи жаловались на громкость. Инженеры прятали новые эффекты от лейбла, а мы уже знали — это не просто сингл.`
    );
  }
  return null;
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
  storyNarrator: StoryNarratorId | unknown = 'auto',
): StoryScript {
  const voiceId: YandexVoiceId = voiceForYear(year, genre);
  const narratorId = resolveStoryNarrator(storyNarrator);
  const persona = buildPersonaForNarrator(narratorId, year, genre, artist);
  let angleIndex = previousScripts.length;

  if (narratorId !== 'auto') {
    const narratorScript = buildNarratorScript(artist, title, narratorId);
    if (narratorScript && !isTooSimilar(narratorScript, previousScripts)) {
      return {
        script: narratorScript,
        word_count: narratorScript.trim().split(/\s+/).filter(Boolean).length,
        voiceId,
      };
    }
  }

  const custom = artistFact(artist, title);
  if (custom && !isTooSimilar(custom, previousScripts)) {
    return {
      script: custom,
      word_count: custom.trim().split(/\s+/).filter(Boolean).length,
      voiceId,
    };
  }

  const narratorScript = buildNarratorScript(artist, title, narratorId);
  if (narratorScript && !isTooSimilar(narratorScript, previousScripts)) {
    return {
      script: narratorScript,
      word_count: narratorScript.trim().split(/\s+/).filter(Boolean).length,
      voiceId,
    };
  }

  for (let attempt = 0; attempt < ANGLES.length; attempt++) {
    const script = buildAngleScript(artist, title, angleIndex + attempt, persona);
    if (!isTooSimilar(script, previousScripts)) {
      return {
        script,
        word_count: script.trim().split(/\s+/).filter(Boolean).length,
        voiceId,
      };
    }
  }

  const fallback = buildAngleScript(artist, title, 0, persona);
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
