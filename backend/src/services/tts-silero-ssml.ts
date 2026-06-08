import type { TtsPauseProfile, TtsVoiceStyleId } from './tts-voice-profiles.js';

function sentenceBreakMs(profile: TtsPauseProfile): number {
  if (profile === 'airy') return 520;
  if (profile === 'natural') return 420;
  return 340;
}

function commaBreakMs(profile: TtsPauseProfile): number {
  if (profile === 'airy') return 220;
  if (profile === 'natural') return 180;
  return 140;
}

function prosodyForStyle(style: TtsVoiceStyleId | undefined): { rate: string; pitch: string } {
  switch (style) {
    case 'radio_host':
      return { rate: 'medium', pitch: 'x-high' };
    case 'warm_story':
      return { rate: 'medium', pitch: 'medium' };
    case 'night_soft':
      return { rate: 'slow', pitch: 'x-low' };
    default:
      return { rate: 'medium', pitch: 'medium' };
  }
}

/**
 * Silero v5_ru SSML — pauses + prosody (server wraps in outer <speak>).
 * Do NOT send raw Latin to Silero — navatusein letter-transliterates to garbage («Тхе Хит Цо»).
 * BFF converts EN via CMU dict + G2P before synthesis.
 */
export function wrapSileroRussianSsml(
  plainRussian: string,
  options: { pauseProfile?: TtsPauseProfile; styleId?: TtsVoiceStyleId } = {},
): string {
  const profile = options.pauseProfile ?? 'natural';
  const sentMs = sentenceBreakMs(profile);
  const commaMs = commaBreakMs(profile);
  const { rate, pitch } = prosodyForStyle(options.styleId);

  let text = plainRussian.trim();
  text = text.replace(/([.!?…])(\s+)/g, `$1 <break time="${sentMs}ms"/>$2`);
  text = text.replace(/,(?=\s)/g, `,<break time="${commaMs}ms"/>`);
  text = text.replace(/\s+—\s+/g, ` <break time="${commaMs}ms"/> `);

  const sentences = text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const body =
    sentences.length > 0
      ? sentences.map((s) => `<s>${s}</s>`).join(' ')
      : `<s>${text}</s>`;

  return `<p><prosody rate="${rate}" pitch="${pitch}">${body}</prosody></p>`;
}
