import { primaryArtistName } from './artist-primary.js';
import { phraseVariants, shouldStripLatinTrackNames } from './tts-generic-script.js';
import { resolveArtistGrammarRu } from './artist-grammar.js';

/** Промпт: модель пишет текст сразу без имён артиста/трека (не постобработка). */
export function buildVoiceoverNoNamesPromptBlock(artist: string, title: string): string {
  const grammar = resolveArtistGrammarRu(artist);
  const performer =
    grammar.kind === 'group'
      ? 'эта группа / этот коллектив / они'
      : grammar.gender === 'feminine'
        ? 'эта исполнительница / она'
        : grammar.gender === 'masculine'
          ? 'этот исполнитель / он'
          : 'этот артист / в треке / у этой песни (без он/она)';

  return `ОЗВУЧКА БЕЗ ИМЁН АРТИСТА И ТРЕКА (ПРИОРИТЕТ НАД ДРУГИМИ ПРАВИЛАМИ ПРО ЛАТИНИЦУ):
- В поле script ЗАПРЕЩЕНО писать «${artist}» и «${title}» — латиницей, кириллицей, в кавычках, переводом.
- Метаданные выше — только для контекста; в озвучку их не вставляй.
- Вместо артиста: ${performer}. Живые зачины: «Эта группа — история о…», «Этот исполнитель когда-то…», «У этой песни…».
- Вместо названия трека: «эта песня», «этот трек», «у этой песни» — без слова «композиция».
- Имена людей ИЗ СЕМЕНИ (продюсер, участник, автор из факта) — можно.
- ЗАПРЕЩЕНО: «музыкант — это история», «в этой композиции — один из треков», голые «музыкант/исполнитель/группа» без «эта/этот».
- Пиши текст сразу готовым для TTS — не рассчитывай на замену слов после генерации.
- БЕЗ ВОДЫ: не «история о том, как», не лекции о жанре, не «уникальный звук/глубокий смысл» — только факты из семени.`;
}

/** Промпт: латинские имена разрешены, но не в каждом предложении — местоимения и «этот трек». */
export function buildVoiceoverNamesEconomyPromptBlock(artist: string, title: string): string {
  const grammar = resolveArtistGrammarRu(artist);
  const primary = primaryArtistName(artist);
  const pronouns =
    grammar.kind === 'group'
      ? 'они / этот коллектив / эта группа / их альбом / их концерты / у них'
      : grammar.gender === 'feminine'
        ? 'она / эта исполнительница / её альбом / у неё'
        : grammar.gender === 'masculine'
          ? 'он / этот исполнитель / его альбом / у него'
          : 'этот артист / в треке / у этой песни (без он/она/они про одного человека)';
  const trackAlt = 'этот трек / эта песня / у этой песни / в ней';
  const duetHint = /,\s*|\s&\s|\s+and\s+/i.test(artist)
    ? '- Дуэт/коллаб в латинских именах: пиши «Artist A and Artist B», НЕ «Artist A и Artist B».\n'
    : '';

  return `ЭКОНОМИЯ ИМЁН В ОЗВУЧКЕ (когда латинские имена РАЗРЕШЕНЫ):
${duetHint}- Название трека «${title}» — максимум ОДИН раз на весь текст, только в первом предложении.
- Имя артиста «${primary}» — максимум ДВА раза (обычно: в начале + ещё раз только если без него теряется смысл).
- При первом упоминании трека и артиста: «${title} by ${primary}» или «${title} — ${primary}» — НЕ «${title} ${primary}» подряд без «by»/«—».
- Дальше вместо артиста: ${pronouns}. Вместо названия трека: ${trackAlt}.
- ЗАПРЕЩЕНО повторять «${primary}» или «${title}» в каждом предложении — это звучит бедно и роботизированно.
- Живая речь: «они соединили», «этот трек стал визитной карточкой», «их концерты» — не «Gorillaz… Gorillaz… Gorillaz».
- НЕ «визитным камушком» — только «визитной карточкой».
- Восторг фаната — через факты из семени и местоимения, не через многократное имя артиста.
- Имена людей ИЗ СЕМЕНИ (продюсер, feat, автор) — можно по смыслу.`;
}

export function buildVoiceoverNamesEconomyPromptBlockEn(artist: string, title: string): string {
  const primary = primaryArtistName(artist);
  return `NAME ECONOMY IN VOICEOVER (when Latin names ARE allowed):
- Track title "${title}" — at most ONCE in the entire script, only in the first sentence.
- Artist name "${primary}" — at most TWICE (usually: opener + once more only if meaning breaks without it).
- After that use pronouns: they / this band / this artist / their album / this track / the song.
- Do NOT repeat "${primary}" or "${title}" in every sentence — it sounds robotic and thin.
- Enthusiasm through seed facts and pronouns, not by hammering the artist name.`;
}

export const RUSSIAN_LANGUAGE_NO_NAMES_OVERRIDE = `ЯЗЫК БЕЗ ИМЁН (перекрывает общие правила про латиницу):
- В script — русский. Имена артиста и трека из метаданных НЕ вставляй.
- Латиница в script — только устоявшиеся термины (Billboard, MTV, moonwalk) и имена из семени факта.
- НЕ переводи название трека на русский и НЕ называй его латиницей.`;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Возвращает причину брака, если в озвучке просочились имя артиста или трек. */
export function scriptLeaksVoiceoverNames(script: string, artist: string, title: string): string | null {
  const trimmed = script.trim();
  if (!trimmed) return null;

  const checkPhrase = (phrase: string, label: string): string | null => {
    const p = phrase.trim();
    if (p.length < 2) return null;
    for (const variant of phraseVariants(p)) {
      const escaped = escapeRe(variant);
      if (new RegExp(`«\\s*${escaped}\\s*»`, 'i').test(trimmed)) {
        return `voiceover names leak: ${label} «${variant}»`;
      }
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(trimmed)) {
        return `voiceover names leak: ${label} "${variant}"`;
      }
    }
    return null;
  };

  if (shouldStripLatinTrackNames(artist) || /[а-яёА-ЯЁ]/.test(artist)) {
    const artistLeak = checkPhrase(artist, 'artist');
    if (artistLeak) return artistLeak;
  }
  if (shouldStripLatinTrackNames(title) || /[а-яёА-ЯЁ]/.test(title)) {
    const titleLeak = checkPhrase(title, 'title');
    if (titleLeak) return titleLeak;
  }

  const bareLead = trimmed.match(/^(музыкант|исполнитель|артист|группа)\s*[—–-]/iu);
  if (bareLead) return `voiceover names leak: bare "${bareLead[1]}" lead`;

  if (/в этой композиции\s*[—–-]\s*один из треков/i.test(trimmed)) {
    return 'voiceover names leak: composition filler phrase';
  }

  return null;
}

export function isVoiceoverWithoutTrackNames(speakTrackNamesInVoiceover?: boolean): boolean {
  return speakTrackNamesInVoiceover !== true;
}
