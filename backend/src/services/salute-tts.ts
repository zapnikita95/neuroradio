import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch';
import { isSaluteSpeechEnabled } from './entitlements.js';
import { getSaluteAccessToken, hasSaluteSpeechCredentials } from './salute-speech-auth.js';
import { getSaluteHttpsAgent } from './salute-http.js';
import {
  buildSaluteSsml,
  prepareSaluteSpeechText,
  resolveSaluteVoice,
  yandexSpeedToSaluteRate,
  type SaluteVoiceId,
} from './salute-ssml.js';
import type { TtsPauseProfile } from './tts-voice-profiles.js';
import type { StoryNarratorId } from './story-narrator.js';
import { AUDIO_DIR, type SynthesisResult } from './yandex-tts.js';

const SYNTH_URL = 'https://smartspeech.sber.ru/rest/v1/text:synthesize';

export { hasSaluteSpeechCredentials };

export function canUseSaluteSpeechProduction(): boolean {
  return hasSaluteSpeechCredentials() && isSaluteSpeechEnabled();
}

export interface SaluteSynthesisOptions {
  artist?: string;
  title?: string;
  speed?: number;
  pauseProfile?: TtsPauseProfile;
  styleId?: string;
  storyNarrator?: StoryNarratorId;
  voice?: SaluteVoiceId;
  speakTrackNamesInVoiceover?: boolean;
  /** Client billing — Authorization Key from Studio (not stored on server). */
  clientAuthKey?: string;
}

/**
 * SaluteSpeech (Сбер) — синтез ru-RU, работает из РФ.
 */
export async function synthesizeSpeechSalute(
  script: string,
  fileName: string,
  options: SaluteSynthesisOptions = {},
): Promise<SynthesisResult> {
  const clientAuthKey = options.clientAuthKey?.trim();
  if (!clientAuthKey && !canUseSaluteSpeechProduction()) {
    throw new Error(
      'SaluteSpeech не включён. Нужны ключи Studio и SALUTE_SPEECH_ENABLED=true. См. backend/SALUTE_SPEECH.md',
    );
  }

  const artist = options.artist ?? '';
  const title = options.title ?? '';
  const speed = options.speed ?? 0.92;
  const voice =
    options.voice ??
    resolveSaluteVoice(options.styleId ?? 'auto', options.storyNarrator ?? 'auto');

  const plainText = prepareSaluteSpeechText(
    script,
    artist,
    title,
    options.speakTrackNamesInVoiceover === true,
  );
  const ssml = buildSaluteSsml(plainText, {
    voice,
    rate: yandexSpeedToSaluteRate(speed),
    pauseProfile: options.pauseProfile,
  });

  const format = process.env.SALUTE_SPEECH_FORMAT?.trim() || 'opus';
  const url = `${SYNTH_URL}?format=${encodeURIComponent(format)}&voice=${encodeURIComponent(voice)}`;

  const token = await getSaluteAccessToken(clientAuthKey);
  const rqUid = crypto.randomUUID();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/ssml+xml',
      Accept: 'audio/ogg',
      RqUID: rqUid,
    },
    body: ssml,
    agent: getSaluteHttpsAgent() as import('node:http').Agent | undefined,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SaluteSpeech TTS error ${response.status}: ${body.slice(0, 280)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const safeName = fileName.endsWith('.ogg') ? fileName : `${fileName}.ogg`;
  const filePath = path.join(AUDIO_DIR, safeName);

  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(filePath, buffer);

  console.log(
    `[salute-tts] ok voice=${voice} format=${format} bytes=${buffer.length} chars=${plainText.length} billing=${clientAuthKey ? 'client' : 'server'}`,
  );

  return {
    fileName: safeName,
    filePath,
    audioUrl: `/audio/${safeName}`,
  };
}
