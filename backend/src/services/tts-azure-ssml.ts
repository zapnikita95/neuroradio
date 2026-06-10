/**
 * Azure Speech SSML for ru-RU neural voices.
 * @see https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup
 */

import { sanitizeScriptForTts } from './story-quality.js';
import { runTtsQualityPass } from './tts-quality-pass.js';
import type { TtsPauseProfile } from './tts-voice-profiles.js';
import type { StoryNarratorId } from './story-narrator.js';
import { detectLatinLangCode } from './tts-foreign-lang.js';

export type AzureRuVoiceId =
  | 'ru-RU-DmitryNeural'
  | 'ru-RU-SvetlanaNeural'
  | 'ru-RU-DariyaNeural';

const PAUSE_MS: Record<TtsPauseProfile, { comma: number; sentence: number; dash: number }> = {
  tight: { comma: 120, sentence: 220, dash: 180 },
  natural: { comma: 180, sentence: 320, dash: 260 },
  airy: { comma: 260, sentence: 450, dash: 340 },
};

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Remove SpeechKit pause tags only — keep + stress marks for plain-text engines (Silero). */
export function stripYandexPauseMarkup(text: string): string {
  return text
    .replace(/<\[(?:small|medium|large|tiny|huge|sentence)\]>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function stripYandexMarkup(text: string): string {
  return stripYandexPauseMarkup(text).replace(/\+/g, '');
}

export function yandexSpeedToAzureRate(speed: number): string {
  const pct = Math.round((speed - 1) * 100);
  const clamped = Math.max(-25, Math.min(25, pct));
  return `${clamped >= 0 ? '+' : ''}${clamped}%`;
}

export function resolveAzureVoiceForStyle(
  styleId: string,
  narratorId: StoryNarratorId,
): AzureRuVoiceId {
  const override = process.env.AZURE_SPEECH_VOICE?.trim();
  if (override && /^ru-RU-\w+Neural$/i.test(override)) {
    return override as AzureRuVoiceId;
  }

  if (styleId === 'night_soft' || narratorId === 'night_dj') {
    return 'ru-RU-DariyaNeural';
  }
  if (styleId === 'warm_story' || narratorId === 'fan' || narratorId === 'contemporary') {
    return 'ru-RU-SvetlanaNeural';
  }
  return 'ru-RU-DmitryNeural';
}

function segmentWithForeignLang(text: string): string {
  const re =
    /([A-Za-zÀ-ÿäöüßÄÖÜ][A-Za-zÀ-ÿäöüßÄÖÜ0-9&'’.-]*(?:\s+[A-Za-zÀ-ÿäöüßÄÖÜ][A-Za-zÀ-ÿäöüßÄÖÜ0-9&'’.-]*)*)/g;
  let last = 0;
  let out = '';
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const before = text.slice(last, match.index);
    if (before) out += escapeXml(before);
    const lang = detectLatinLangCode(match[1]!);
    out += `<lang xml:lang="${lang}">${escapeXml(match[1]!)}</lang>`;
    last = match.index + match[0].length;
  }
  out += escapeXml(text.slice(last));
  return out;
}

function injectProsodyPauses(body: string, profile: TtsPauseProfile): string {
  const ms = PAUSE_MS[profile];
  return body
    .replace(/([.!?…])(\s+)/g, `$1<break time="${ms.sentence}ms"/>$2`)
    .replace(/,(\s+)/g, `,<break time="${ms.comma}ms"/>$1`)
    .replace(/\s+—\s+/g, `<break time="${ms.dash}ms"/>`);
}

export function preparePlainSpeechText(
  script: string,
  artist: string,
  title: string,
): string {
  let text = sanitizeScriptForTts(script, artist, title);
  text = runTtsQualityPass(text).text;
  return stripYandexMarkup(text);
}

export function buildAzureSsml(
  plainText: string,
  options: {
    voice: AzureRuVoiceId;
    rate: string;
    pauseProfile?: TtsPauseProfile;
  },
): string {
  const profile = options.pauseProfile ?? 'natural';
  let body = segmentWithForeignLang(plainText);
  body = injectProsodyPauses(body, profile);

  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ru-RU">` +
    `<voice name="${options.voice}">` +
    `<prosody rate="${options.rate}">${body}</prosody>` +
    `</voice></speak>`
  );
}
