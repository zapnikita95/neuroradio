import fetch from 'node-fetch';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  coerceVoiceForSpeechKit,
  voiceSupportsEmotion,
  voiceSupportsEvilEmotion,
  YandexVoiceId,
} from './voices.js';
import {
  DEFAULT_TTS_EMOTION,
  DEFAULT_TTS_SPEED,
  TtsEmotion,
  TtsOptions,
} from './tts-options.js';
import { prepareYandexTtsText } from './tts-markup.js';

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
    const emotion =
      options.emotion === 'evil' && !voiceSupportsEvilEmotion(voiceId)
        ? 'neutral'
        : options.emotion;
    params.set('emotion', emotion);
  }

  return params;
}

/**
 * Synthesizes Russian speech via Yandex SpeechKit and saves OGG Opus to audio/.
 */
const TTS_FALLBACK_CHAIN: YandexVoiceId[] = ['zahar', 'alena', 'filipp', 'marina'];

function isUnsupportedVoiceError(status: number, body: string): boolean {
  return status === 400 && /unsupported voice/i.test(body);
}

async function requestTts(apiKey: string, params: URLSearchParams) {
  return fetch(`${TTS_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${apiKey}` },
    signal: AbortSignal.timeout(45000),
  });
}

export async function synthesizeSpeech(
  text: string,
  voiceId: YandexVoiceId,
  fileName: string,
  options: Partial<TtsOptions> & { artist?: string; title?: string } = {},
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

  const markedText = prepareYandexTtsText(text, {
    artist: options.artist,
    title: options.title,
    sentencePauses: true,
  });

  await mkdir(AUDIO_DIR, { recursive: true });

  const primaryVoice = coerceVoiceForSpeechKit(voiceId);
  const voicesToTry = [
    primaryVoice,
    ...TTS_FALLBACK_CHAIN.filter((v) => v !== primaryVoice),
  ];

  let lastError = 'Yandex TTS failed';
  for (const tryVoice of voicesToTry) {
    let params = buildTtsParams(markedText, tryVoice, folderId, ttsOptions);
    let response = await requestTts(apiKey, params);

    if (!response.ok && params.has('emotion') && ttsOptions.emotion !== 'neutral') {
      params = buildTtsParams(markedText, tryVoice, folderId, { ...ttsOptions, emotion: 'neutral' });
      response = await requestTts(apiKey, params);
    }

    if (response.ok) {
      if (tryVoice !== voiceId) {
        console.warn(`[tts] voice ${voiceId} → ${tryVoice} (SpeechKit v1)`);
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

    const body = await response.text();
    lastError = `Yandex TTS error ${response.status}: ${body}`;
    if (!isUnsupportedVoiceError(response.status, body)) {
      throw new Error(lastError);
    }
    console.warn(`[tts] unsupported voice ${tryVoice}, trying fallback`);
  }

  throw new Error(lastError);
}

export type { TtsEmotion, TtsOptions };
