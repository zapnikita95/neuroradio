import fetch from 'node-fetch';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { voiceSupportsEmotion, YandexVoiceId } from './voices.js';

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

function buildTtsParams(text: string, voiceId: YandexVoiceId, folderId: string): URLSearchParams {
  const params = new URLSearchParams({
    text,
    lang: 'ru-RU',
    voice: voiceId,
    format: 'oggopus',
    folderId,
    speed: '0.90',
  });

  if (voiceSupportsEmotion(voiceId)) {
    params.set('emotion', 'good');
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
): Promise<SynthesisResult> {
  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;

  if (!apiKey || !folderId) {
    throw new Error('YANDEX_API_KEY and YANDEX_FOLDER_ID are required');
  }

  await mkdir(AUDIO_DIR, { recursive: true });

  let params = buildTtsParams(text, voiceId, folderId);
  let response = await fetch(`${TTS_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${apiKey}` },
    signal: AbortSignal.timeout(45000),
  });

  if (!response.ok && params.has('emotion')) {
    params = buildTtsParams(text, voiceId, folderId);
    params.delete('emotion');
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
