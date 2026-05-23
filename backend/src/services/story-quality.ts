/** ~30 sec Russian narration at natural pace */
export const STORY_WORDS_MIN = 72;
export const STORY_WORDS_MAX = 98;

export const BANNED_SCRIPT_PATTERNS: RegExp[] = [
  /^«?\s*знаю\s+(интересн|один|такой|факт)/i,
  /^«?\s*интересн/i,
  /^«?\s*вот что/i,
  /^«?\s*факт\s*:/i,
  /^«?\s*слушай[,]?\s*(факт|интересн)/i,
  /зал просто сходит с ума/i,
  /зрители в экстазе/i,
  /элвис в огне/i,
  /вкладывает душу/i,
  /магия музыки/i,
  /music story/i,
];

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function validateStoryScript(script: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = script.trim();
  if (!trimmed) return { ok: false, reason: 'empty script' };

  const words = countWords(trimmed);
  if (words < STORY_WORDS_MIN) {
    return { ok: false, reason: `too short (${words} words, need ${STORY_WORDS_MIN}+)` };
  }
  if (words > STORY_WORDS_MAX + 15) {
    return { ok: false, reason: `too long (${words} words)` };
  }

  for (const pattern of BANNED_SCRIPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: `banned pattern: ${pattern.source}` };
    }
  }

  return { ok: true };
}
