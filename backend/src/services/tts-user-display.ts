/**
 * Text shown in the app («Как озвучено») — readable Latin names, not phonetic Cyrillic.
 * Prefer [displayScript] (LLM script) when names are spoken; [ttsTranscript] is TTS-processed.
 */

const CYRILLIC_GARBAGE_TO_LATIN: Array<[RegExp, string]> = [
  [/й\+?утй\+?уб/gi, 'YouTube'],
  [/ют\+?уб/gi, 'YouTube'],
  [/т\+?ик\s*т\+?ок/gi, 'TikTok'],
  [/сп\+?от\+?иф\+?ай/gi, 'Spotify'],
  [/эм\s*ти\s*ви/gi, 'MTV'],
  [/зэ\s*2\s*нд\s*ло/gi, 'The 2nd Law'],
  [/зэ\s*second\s*ло/gi, 'The Second Law'],
];

/** Normalize text shown in the client UI. */
export function formatUserFacingTranscript(text: string, displayScript?: string): string {
  const base = (displayScript?.trim() || text).trim();
  if (!base) return base;
  let out = base;
  for (const [pattern, replacement] of CYRILLIC_GARBAGE_TO_LATIN) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
