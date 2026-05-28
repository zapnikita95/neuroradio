/**
 * SSML for SaluteSpeech (SmartSpeech).
 * @see https://developers.sber.ru/docs/ru/salutespeech/guides/synthesis/synthesis-sync
 */

import type { StoryNarratorId } from './story-narrator.js';
import type { TtsPauseProfile } from './tts-voice-profiles.js';
import { preparePlainSpeechText } from './tts-azure-ssml.js';

export type SaluteVoiceId =
  | 'Pon_24000'
  | 'Tur_24000'
  | 'May_24000'
  | 'Ost_24000'
  | 'Bys_24000'
  | 'Nec_24000';

const PAUSE_MS: Record<TtsPauseProfile, { comma: number; sentence: number }> = {
  tight: { comma: 120, sentence: 250 },
  natural: { comma: 200, sentence: 380 },
  airy: { comma: 280, sentence: 520 },
};

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function resolveSaluteVoice(
  styleId: string,
  narratorId: StoryNarratorId,
): SaluteVoiceId {
  const override = process.env.SALUTE_SPEECH_VOICE?.trim();
  if (override && /^[A-Za-z]{3}_\d+$/.test(override)) {
    return override as SaluteVoiceId;
  }

  if (styleId === 'night_soft' || narratorId === 'night_dj') return 'Ost_24000';
  if (styleId === 'warm_story' || narratorId === 'fan' || narratorId === 'contemporary') {
    return 'May_24000';
  }
  if (narratorId === 'expert' || narratorId === 'backstage') return 'Tur_24000';
  return 'Pon_24000';
}

function segmentWithEnglishLang(text: string): string {
  const re =
    /([A-Za-z][A-Za-z0-9&'’.-]*(?:\s+[A-Za-z][A-Za-z0-9&'’.-]*)*)/g;
  let last = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    out += escapeXml(text.slice(last, match.index));
    out += `<lang xml:lang="en-US">${escapeXml(match[1]!)}</lang>`;
    last = match.index + match[0].length;
  }
  out += escapeXml(text.slice(last));
  return out;
}

function injectPauses(body: string, profile: TtsPauseProfile): string {
  const ms = PAUSE_MS[profile];
  return body
    .replace(/([.!?…])(\s+)/g, `$1<break time="${ms.sentence}ms"/>$2`)
    .replace(/,(\s+)/g, `,<break time="${ms.comma}ms"/>$1`);
}

export function yandexSpeedToSaluteRate(speed: number): string {
  if (speed <= 0.88) return 'slow';
  if (speed >= 1.05) return 'fast';
  return 'medium';
}

export function buildSaluteSsml(
  plainText: string,
  options: {
    voice: SaluteVoiceId;
    rate?: string;
    pauseProfile?: TtsPauseProfile;
  },
): string {
  const profile = options.pauseProfile ?? 'natural';
  let body = segmentWithEnglishLang(plainText);
  body = injectPauses(body, profile);
  const rate = options.rate ?? 'medium';

  return (
    `<speak>` +
    `<voice name="${options.voice}">` +
    `<prosody rate="${rate}">${body}</prosody>` +
    `</voice>` +
    `</speak>`
  );
}

export function prepareSaluteSpeechText(
  script: string,
  artist: string,
  title: string,
): string {
  return preparePlainSpeechText(script, artist, title);
}
