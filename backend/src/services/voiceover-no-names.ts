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
        : 'этот исполнитель / он';

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
