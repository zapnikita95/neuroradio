import fetch from 'node-fetch';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceSupportsEmotion, YandexVoiceId } from './voices.js';
import {
  DEFAULT_TTS_EMOTION,
  DEFAULT_TTS_SPEED,
  TtsEmotion,
  TtsOptions,
} from './tts-options.js';

const TTS_URL = 'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUDIO_DIR = path.resolve(__dirname, '../../audio');

export interface SynthesisResult {
  fileName: string;
  filePath: string;
  audioUrl: string;
}

export function hasYandexCredentials(): boolean {
  return Boolean(
    process.env.YANDEX_API_KEY?.trim() && process.env.YANDEX_FOLDER_ID?.trim(),
  );
}

function buildTtsParams(
  text: string,
  voiceId: YandexVoiceId,
  folderId: string,
  options: TtsOptions,
): URLSearchParams {
  const params = new URLSearchParams({
    text,
    lang: 'ru-RU',
    voice: voiceId,
    format: 'oggopus',
    folderId,
    speed: String(options.speed),
  });

  if (voiceSupportsEmotion(voiceId)) {
    params.set('emotion', options.emotion);
  }

  return params;
}

/**
 * Synthesizes Russian speech via Yandex SpeechKit and saves OGG Opus to audio/.
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: YandexVoiceId,
  fileName: string,
  options: Partial<TtsOptions> = {},
): Promise<SynthesisResult> {
  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;

  if (!apiKey || !folderId) {
    throw new Error('YANDEX_API_KEY and YANDEX_FOLDER_ID are required');
  }

  const ttsOptions: TtsOptions = {
    speed: options.speed ?? DEFAULT_TTS_SPEED,
    emotion: options.emotion ?? DEFAULT_TTS_EMOTION,
  };

  await mkdir(AUDIO_DIR, { recursive: true });

  let params = buildTtsParams(text, voiceId, folderId, ttsOptions);
  let response = await fetch(`${TTS_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${apiKey}` },
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok && params.has('emotion') && ttsOptions.emotion !== 'neutral') {
    params = buildTtsParams(text, voiceId, folderId, { ...ttsOptions, emotion: 'neutral' });
    response = await fetch(`${TTS_URL}?${params.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Api-Key ${apiKey}` },
      signal: AbortSignal.timeout(45000),
    });
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Yandex TTS error ${response.status}: ${body}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const safeName = fileName.endsWith('.ogg') ? fileName : `${fileName}.ogg`;
  const filePath = path.join(AUDIO_DIR, safeName);

  await writeFile(filePath, buffer);

  return {
    fileName: safeName,
    filePath,
    audioUrl: `/audio/${safeName}`,
  };
}

export type { TtsEmotion, TtsOptions };
