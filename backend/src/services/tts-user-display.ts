/**
 * Text shown in the app («Как озвучено») — readable brands, not phonetic garbage.
 * TTS markup path may still use phonetics; this runs only on tts_transcript.
 */

const USER_DISPLAY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/й\+?утй\+?уб/gi, 'YouTube'],
  [/ют\+?уб/gi, 'YouTube'],
  [/т\+?ик\s*т\+?ок/gi, 'TikTok'],
  [/сп\+?от\+?иф\+?ай/gi, 'Spotify'],
  [/эм\s*ти\s*ви/gi, 'MTV'],
];

/** Normalize tts_transcript before sending to the client. */
export function formatUserFacingTranscript(text: string): string {
  let out = text.trim();
  if (!out) return out;
  for (const [pattern, replacement] of USER_DISPLAY_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}
