import type { StoryNarratorId } from './story-narrator.js';
import type { StoryLanguageId } from './story-language.js';
import { scriptSimilarity } from './story-quality.js';

type PersonaKey = Exclude<StoryNarratorId, 'auto'>;

/** RU closing reactions — Cyrillic only (TTS reads Latin aloud). */
const CLOSING_POOLS_RU: Record<PersonaKey, string[]> = {
  fan: [
    'Факт, достойный отдельного подкаста!',
    'Такой факт просто не оставит равнодушным!',
    'Это реально незабываемая деталь!',
    'Вот из-за таких историй я и обожаю их творчество.',
    'История, которую мы — фанаты — часто вспоминаем.',
    'Обожаю, когда за песней стоит живая история.',
    'От таких деталей только сильнее тянет слушать их снова.',
    'Честно — факт огонь, такое не забываешь.',
    'Именно за такое я и уважаю этих ребят.',
    'Только истинный фанат может знать такие детали.',
  ],
  contemporary: [
    'Мы с друзьями ещё не раз вспоминали эту историю!',
    'Вот ради таких историй и тянет переслушивать знакомые песни.',
    'Честно, от таких деталей музыка оживает по-новому.',
    'Такие штуки и делают песню больше, чем просто фоновой музыкой.',
    'Кому ни расскажешь такое — все удивляются!',
    'Не думал, что за знакомой мелодией может столько всего стоять.',
    'Вот почему эта композиция так хорошо запомнилась.',
    'После такой истории трек мне сразу запомнился.',
    'Такой факт — и песня уже другая, хотя мелодия та же.',
    'Обожаю, когда любимая песня на самом деле ещё глубже, чем кажется.',
  ],
  expert: [
    'Такой факт можно встретить в любом серьёзном разборе этой композиции.',
    'В любом серьёзном разборе этой композиции такая деталь всплывает почти всегда.',
    'Открой серьёзный разбор этой композиции — там наверняка найдёшь похожий факт.',
    'Эту деталь редко пропускают, когда разбирают эту композицию всерьёз.',
    'В разборе этой композиции такие факты — не редкость.',
    'Любой серьёзный разбор этой композиции опирается на подобные детали.',
    'Такие факты и делают разбор этой композиции по-настоящему интересным.',
    'Без такой детали разбор этой композиции выглядел бы неполным.',
    'В музыкальной прессе при разборе этой композиции такое всплывает часто.',
    'Это не байки фанатов — это то, что реально меняет взгляд на запись.',
  ],
  radio_host: [
    'Такое нарочно не придумаешь!',
    'Не переключайтесь!',
    'Этот трек — наш любимчик на станции!',
    'Вот это да! А теперь вернёмся к прослушиванию.',
    'Вот как-то так, друзья! Отличного прослушивания!',
    'У нас в эфире только ваши любимые треки, не переключайтесь!',
    'В чартах или нет, этот трек запомнится надолго!',
    'Ну и ну, не терпится послушать дальше!',
    'Факт не оставит равнодушным, как и сама композиция!',
    'А на этом у нас всё, вернёмся к прослушиванию!',
  ],
  backstage: [
    'Но только давайте это будет наш с вами секрет!',
    'Все свои знают об этом, теперь и вы знаете!',
    'Именно это потом обсуждают за закрытыми дверями.',
    'Только факты — без софитов и вымысла.',
    'Да это знает каждый, кто в теме!',
    'Вот за такие истории этот бизнес и любят изнутри.',
    'Не каждый день случается что-то настолько показательное.',
    'Мне шепнули это по секрету, вы смотрите, не проболтайтесь!',
    'Это вовсе не слух: это факт из первых рук!',
    'Да.... В интервью такого не расскажут!',
  ],
  night_dj: [
    'Ночью такие истории звучат особенно честно.',
    'Тихий эфир для таких фактов — самое место.',
    'Не переключайтесь — послушайте до конца.',
    'Посреди ночи такой факт попадает прямо в душу.',
    'Зная это, ночью получаешь особенный опыт прослушивания.',
    'Ночью каждая такая деталь на вес золота.',
    'Именно ночью начинаешь слышать гораздо больше.',
    'Ночью музыка с таким фактом открывается по-новому.',
    'Давайте же насладимся этой композицией.',
    'Спокойной ночи и хорошей музыки!',
  ],
};

/** EN closing reactions — English only, same persona vibe as RU pools. */
const CLOSING_POOLS_EN: Record<PersonaKey, string[]> = {
  fan: [
    'A fact worthy of its own podcast episode!',
    'A detail like that will not leave anyone cold!',
    'That is a truly unforgettable detail!',
    'Stories like this are why I love their music.',
    'A story we fans keep coming back to.',
    'I love when there is a real story behind a song.',
    'Details like that make me want to listen again.',
    'Honestly — killer fact, you do not forget that.',
    'That is exactly why I respect these artists.',
    'Only a true fan would know a detail like that.',
  ],
  contemporary: [
    'My friends and I have brought this story up more than once!',
    'Stories like this make you want to replay old favorites.',
    'Honestly, details like that bring the music back to life.',
    'Stuff like this makes a song more than just background music.',
    'Tell anyone this — they are shocked!',
    'Did not think so much could hide behind a familiar melody.',
    'That is why this track stuck with me.',
    'After a story like that, the track hits different.',
    'Same melody — whole new song once you know the fact.',
    'I love when a favorite track runs even deeper than it seems.',
  ],
  expert: [
    'A fact like this shows up in any serious breakdown of this track.',
    'In any serious breakdown of this track, a detail like this almost always appears.',
    'Open a serious breakdown of this track — you will likely find a similar fact.',
    'People rarely skip this detail when they break down this track properly.',
    'Facts like this are common when this composition gets a serious breakdown.',
    'Any serious breakdown of this track leans on details like this.',
    'Details like this are what make a breakdown of this track worth hearing.',
    'Without a detail like this, a breakdown of this track would feel incomplete.',
    'Music press often surfaces this when breaking down this composition.',
    'Not fan fiction — this genuinely reframes the record.',
  ],
  radio_host: [
    'You could not make this up!',
    'Do not touch that dial!',
    'This track is a station favorite!',
    'Wow! Now back to the music.',
    'That is a wrap, folks — happy listening!',
    'Only your favorites on our air — stay tuned!',
    'Chart or no chart, this one stays with you.',
    'Man, cannot wait to hear what comes next!',
    'The fact hits as hard as the song itself!',
    'That is all from us — back to the music!',
  ],
  backstage: [
    'But let us keep this our little secret!',
    'Insiders have known this — now you do too!',
    'This is what gets talked about behind closed doors.',
    'Just the facts — no spotlights, no fiction.',
    'Everyone in the know has heard this one.',
    'Stories like this are why people love this business from the inside.',
    'Does not happen every day — something that telling.',
    'Someone whispered this to me — do not go blabbing!',
    'Not rumor — first-hand fact.',
    'Yeah.... You will not hear this in a press interview!',
  ],
  night_dj: [
    'Stories like this land differently at night.',
    'Quiet night radio for facts like this — perfect fit.',
    'Do not go anywhere — listen to the end.',
    'In the dead of night, a fact like that goes straight to the soul.',
    'Knowing this, night listening hits different.',
    'At night, every detail like that is gold.',
    'Night is when you start hearing so much more.',
    'At night, music with a fact like that opens up anew.',
    'Let us savor this track.',
    'Good night and good music!',
  ],
};

function closingPoolsFor(lang: StoryLanguageId): Record<PersonaKey, string[]> {
  return lang === 'en' ? CLOSING_POOLS_EN : CLOSING_POOLS_RU;
}

function assertClosingPoolAlphabets(): void {
  for (const phrase of Object.values(CLOSING_POOLS_RU).flat()) {
    if (/[a-zA-Z]/.test(phrase)) {
      throw new Error(`RU closing phrase must be Cyrillic only: ${phrase}`);
    }
  }
  for (const phrase of Object.values(CLOSING_POOLS_EN).flat()) {
    if (/[а-яёА-ЯЁ]/.test(phrase)) {
      throw new Error(`EN closing phrase must be English only: ${phrase}`);
    }
  }
}
assertClosingPoolAlphabets();

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const CLOSING_OVERUSE_MARKERS: RegExp[] = [
  /мурашк/i,
  /ощущени(?:е|я)\s+эпох/i,
  /не\s+выцветает/i,
  /цепляет/i,
  /замираю/i,
  /на\s+одном\s+дыхании/i,
  /два\s+мира\s+столкнулись/i,
  /вступлен/i,
  /джингл/i,
  /перв(?:ых|ые)\s+(?:секунд|нот|такт)/i,
  /лучше\s+любого\s+джингла/i,
  /После такой истории\s+трек\s+звучит/i,
  /\b(?:не\s+как\s+)?filler\b/i,
  /не\s+как\s+филлер/i,
  /а\s+как\s+событие/i,
  /отделяют\s+хит\s+от/i,
  /в\s+эфир\s+не\s+выкинешь/i,
  /слушател(?:и|ей)\s+сразу\s+цепл/i,
  /такой\s+факт\s+в\s+эфир/i,
  /не\s+нуждается\s+в\s+лишних\s+словах/i,
  /с\s+такой\s+историей\s+за\s+спиной/i,
  /не\s+просто\s+фон/i,
  /с\s+этим\s+контекстом/i,
  /выкидыва/i,
  /плейлист/i,
  /каждый\s+припев/i,
  /цепляюсь\s+к\s+каталог/i,
  /документ\s+эпох/i,
  /суфл[её]р/i,
  /копа(?:ю|л)\s+бэкстейдж/i,
  /разбор\s+дискограф/i,
  /половин[аы]\s+альбом/i,
  /удачн(?:ый|ого)\s+релиз/i,
  /за\s+датами/i,
  /после\s+(?:этого|такого)\b/i,
  /без\s+(?:этой|такой)\s+истории/i,
  /на\s+месте\s+автор/i,
  /ещё\s+один\s+сингл/i,
  /[«""]/,
  /\bканон\b/i,
  /звучит\s+как\s+решен/i,
  /для\s+серь[её]зного\s+разбора\s+это\s+почти\s+обязательный/i,
  /именно\s+такие\s+эксперименты\s+с\s+жанрами/i,
  /потом\s+разбирают\s+на\s+подкастах/i,
];

/** RU: типичная лatin-вставка модели → кириллица для TTS. */
const CLOSING_LATIN_TO_RU: Record<string, string> = {
  filler: 'филлер',
  event: 'событие',
  track: 'трек',
  hit: 'хит',
  mtv: 'МТВ',
};

const CLOSING_TAGLINE_MAX_WORDS = 16;

/** Last sentence still names tracks/artists — not a persona tagline; keep Latin titles intact. */
const STORY_BODY_CLOSING_RE =
  /(?:выделить|назван|запис|выпуст|альбом|трек|песн|композиц|исполн|известн|участ|представл|работ|групп|сингл|кавer|cover|Eurovision|Billboard|Grammy|чарт|релиз|дебют|клип|верси)/iu;

function isStoryBodyClosing(sentence: string): boolean {
  return STORY_BODY_CLOSING_RE.test(sentence.trim());
}

function shouldSanitizeAsClosingTagline(sentence: string): boolean {
  if (isStoryBodyClosing(sentence)) return false;
  return sentence.split(/\s+/).filter(Boolean).length <= CLOSING_TAGLINE_MAX_WORDS;
}

const BAD_CLOSING_TAIL =
  /звучит\s+не\s+как\s+(?:filler|филлер)|После такой истории\s+трек\s+звучит|отделяют\s+хит\s+от/i;

function sanitizeClosingPhrase(phrase: string, lang: StoryLanguageId): string {
  let s = phrase.replace(/[«""„"']/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!s) return '';

  if (lang === 'en') {
    s = s.replace(/[а-яёА-ЯЁ]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return s;
  }

  for (const [latin, ru] of Object.entries(CLOSING_LATIN_TO_RU)) {
    s = s.replace(new RegExp(`\\b${latin}\\b`, 'gi'), ru);
  }
  // ASCII-only: do not strip ê/é/… inside French titles (Mêmes → «M» + «êmes»).
  s = s.replace(/\b[a-zA-Z]+\b/g, (word) => CLOSING_LATIN_TO_RU[word.toLowerCase()] ?? '');
  return s.replace(/\s{2,}/g, ' ').replace(/^[,;:\-—]+/, '').trim();
}

/** Авто-правка финала: кавычки/латиница/штамп — без reject, пользователь не ждёт лишних retry. */
export function sanitizeClosingTail(script: string, lang: StoryLanguageId = 'ru'): string {
  const trimmed = script.trim();
  if (!trimmed) return trimmed;

  const sentences = trimmed.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length <= 1) {
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    // One-sentence story body — not a short closing tagline; keep Latin names (directors, MTV, films).
    if (wordCount > CLOSING_TAGLINE_MAX_WORDS || isStoryBodyClosing(trimmed)) return trimmed;
    const only = sanitizeClosingPhrase(trimmed, lang);
    if (!only || closingHasWrongAlphabet(only, lang) || closingHasQuotes(only)) return trimmed;
    if (isStaleClosingCliche(only) || BAD_CLOSING_TAIL.test(only)) return trimmed;
    return only;
  }

  const closingRaw = sentences.pop()!;
  const body = sentences.join(' ').trim();
  if (!shouldSanitizeAsClosingTagline(closingRaw)) {
    return trimmed;
  }
  let closing = sanitizeClosingPhrase(closingRaw, lang);

  if (
    !closing ||
    closingHasWrongAlphabet(closing, lang) ||
    closingHasQuotes(closing) ||
    isStaleClosingCliche(`${body} ${closing}`) ||
    BAD_CLOSING_TAIL.test(`${body} ${closing}`)
  ) {
    return body;
  }

  return `${body} ${closing}`.replace(/\s{2,}/g, ' ').trim();
}

/** Финал с кавычками — TTS их озвучивает вслух. */
export function closingHasQuotes(text: string): boolean {
  return /[«""„"]/.test(text.trim().slice(-220));
}

/** RU финал с латиницей или EN финал с кириллицей — TTS ломается. */
export function closingHasWrongAlphabet(text: string, lang: StoryLanguageId = 'ru'): boolean {
  const tail = text.trim().slice(-220);
  if (lang === 'en') return /[а-яёА-ЯЁ]/.test(tail);
  return /[a-zA-Z]/.test(tail);
}

/** Дословные штампы финала — никогда не подсказывать модели и отклонять в quality gate. */
export const STALE_CLOSING_CLICHE_PATTERNS: RegExp[] = [
  /в\s+эфир\s+не\s+выкинешь/i,
  /слушател(?:и|ей)\s+сразу\s+цепл/i,
  /такой\s+факт\s+в\s+эфир\s+не/i,
  /не\s+нуждается\s+в\s+лишних\s+словах/i,
  /с\s+такой\s+историей\s+за\s+спиной/i,
  /лучше\s+любого\s+джингла/i,
  /не\s+просто\s+фон/i,
  /с\s+этим\s+контекстом/i,
  /выкидыва/i,
  /каждый\s+припев/i,
  /цепляюсь\s+к\s+каталог/i,
  /копа(?:ю|л)\s+бэкстейдж/i,
  /разбор\s+дискограф/i,
  /после\s+(?:этого|такого)\b/i,
  /без\s+(?:этой|такой)\s+истории/i,
  /[«""]/,
  /\bканон\b/i,
  /звучит\s+как\s+решен/i,
  /для\s+серь[её]зного\s+разбора\s+это\s+почти\s+обязательный/i,
  /именно\s+такие\s+эксперименты\s+с\s+жанрами/i,
  /потом\s+разбирают\s+на\s+подкастах/i,
];

export function isStaleClosingCliche(script: string): boolean {
  const tail = script.trim().slice(-220);
  return STALE_CLOSING_CLICHE_PATTERNS.some((p) => p.test(tail));
}

/** All closing phrase templates by persona (for docs / review). */
export function listClosingPhrasePools(
  lang: StoryLanguageId = 'ru',
): Record<PersonaKey, string[]> {
  return closingPoolsFor(lang);
}

function closingPhraseOverused(phrase: string, previousScripts: string[]): boolean {
  if (previousScripts.some((s) => scriptSimilarity(s, phrase) > 0.42)) return true;
  return previousScripts.some(
    (s) => CLOSING_OVERUSE_MARKERS.some((p) => p.test(s) && p.test(phrase)),
  );
}

export function pickClosingPhraseHint(
  narratorId: StoryNarratorId,
  artist: string,
  title: string,
  previousScripts: string[] = [],
  storyLanguage: StoryLanguageId = 'ru',
): string {
  const key = narratorId === 'auto' ? 'contemporary' : narratorId;
  const basePool = closingPoolsFor(storyLanguage)[key];
  let pool = basePool.filter(
    (phrase) =>
      !closingPhraseOverused(phrase, previousScripts) &&
      !STALE_CLOSING_CLICHE_PATTERNS.some((p) => p.test(phrase)) &&
      !closingHasWrongAlphabet(phrase, storyLanguage),
  );
  if (pool.length === 0) pool = basePool;
  const idx =
    hashSeed(`${key}|${storyLanguage}|${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}|${previousScripts.length}`) %
    pool.length;
  return pool[idx] ?? pool[0]!;
}

function buildRuClosingPromptBlock(
  key: PersonaKey,
  hint: string,
  alts: string,
  personaBan: string,
): string {
  return `ФИНАЛЬНАЯ РЕПЛИКА (одна короткая фраза в конце — своими словами, как живой человек в амплуа; НЕ копируй шаблон дословно):
- Вариант для этого трека: ${hint}
- Другие уместные финалы (чередуй):
${alts}
- Финал = самодостаточная реакция на факт из семени. Не после этого / без этой истории — фраза должна звучать нормально сразу после любого факта.
- Только кириллица в финале — без латиницы и без кавычек (синтез речи их озвучивает вслух).
- ЗАПРЕЩЕНО дословно и близко: в эфир не выкинешь — слушатели цепляются, за спиной не нуждается в лишних словах, не просто фон, с этим контекстом, каждый припев, выкидываю из плейлиста, цепляюсь к каталогу, после этого, без этой истории, канон, трек звучит как решение.
- ЗАПРЕЩЕНО заканчивать реакцией на вступление / первые секунды, если этого нет в семени.${personaBan}`;
}

function buildEnClosingPromptBlock(
  key: PersonaKey,
  hint: string,
  alts: string,
  personaBan: string,
): string {
  return `CLOSING LINE (one short phrase at the end — your own words in persona voice; do NOT copy templates verbatim):
- Suggested for this track: ${hint}
- Other closings (rotate):
${alts}
- Closing = self-contained reaction to the seed fact. No after this / without this story — must work after any fact.
- English only in the closing — no Cyrillic, no quotation marks (TTS reads quotes aloud).
- FORBIDDEN verbatim or near: on air you cannot skip it, listeners hook instantly, no filler/event clichés, after this, without this story.
- Do NOT react to intro / first seconds unless the seed mentions them.${personaBan}`;
}

export function buildClosingPhrasePromptBlock(
  narratorId: StoryNarratorId,
  artist: string,
  title: string,
  previousScripts: string[] = [],
  storyLanguage: StoryLanguageId = 'ru',
): string {
  const hint = pickClosingPhraseHint(narratorId, artist, title, previousScripts, storyLanguage);
  const key = narratorId === 'auto' ? 'contemporary' : narratorId;
  const alts = closingPoolsFor(storyLanguage)[key]
    .filter((line) => line !== hint && !closingPhraseOverused(line, previousScripts))
    .slice(0, 5)
    .map((line) => `• ${line}`)
    .join('\n');

  if (storyLanguage === 'en') {
    const personaBan =
      key === 'fan'
        ? `
- SUPERFAN: warm exclamation, love for the artist. Self-contained — works with any fact.`
        : key === 'radio_host'
          ? `
- RADIO HOST: live on-air vibe — stay tuned, back to the music, wow. No fake call-ins or chart fiction.`
          : key === 'night_dj'
            ? `
- NIGHT DJ: quiet, intimate, late-night delivery. No after this clichés.`
            : key === 'backstage'
              ? `
- BACKSTAGE: industry insider whisper, gossip tone, no invented context.`
              : '';
    return buildEnClosingPromptBlock(key, hint, alts, personaBan);
  }

  const personaBan =
    key === 'fan'
      ? `
- СУПЕРФАН: короткая тёплая реакция-восклицание, любовь к группе/исполнителю. Финал САМОДОСТАТОЧЕН — ложится на любой факт.`
      : key === 'contemporary'
        ? `
- СОВРЕМЕННИК: тёплая реакция своими словами, без привязки к конкретному году или эпохе.`
        : key === 'expert'
          ? `
- ЭКСПЕРТ: финал — серьёзный разбор этой композиции (можно встретить такой факт). Простой язык. Без канона, без обязательный пункт, без разбирают на подкастах.`
          : key === 'radio_host'
            ? `
- РАДИО: живой эфир — коротко, по-дружески: не переключайтесь, вернёмся к прослушиванию, вот это да.`
            : key === 'backstage'
              ? `
- БЭКСТЕЙДЖ: инсайдер индустрии, байки изнутри, без выдуманного контекста.`
              : key === 'night_dj'
                ? `
- НОЧНОЙ ДИДЖЕЙ: тихо, интимно, без исповеди, без после этого.`
                : '';

  return buildRuClosingPromptBlock(key, hint, alts, personaBan);
}
