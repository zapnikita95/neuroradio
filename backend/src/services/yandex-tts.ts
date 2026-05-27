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
import type { TtsPauseProfile } from './tts-voice-profiles.js';

const TTS_URL = 'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUDIO_DIR = path.resolve(__dirname, '../../audio');

export interface SynthesisResult {
  fileName: string;
  filePath: string;
  audioUrl: string;
}

export interface YandexTtsLogContext {
  installId?: string;
  artist?: string;
  title?: string;
}

export function hasYandexCredentials(): boolean {
  return Boolean(
    process.env.YANDEX_API_KEY?.trim() && process.env.YANDEX_FOLDER_ID?.trim(),
  );
}

function summarizeYandexBody(body: string, maxLen = 220): string {
  return body.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function isRetryableTtsParamError(status: number, body: string): boolean {
  if (status !== 400) return false;
  const lower = body.toLowerCase();
  return (
    /unsupported voice/i.test(lower) ||
    /speed|tempo|rate/i.test(lower) ||
    /emotion/i.test(lower) ||
    /invalid.*parameter/i.test(lower)
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

const TTS_FALLBACK_CHAIN: YandexVoiceId[] = ['zahar', 'alena', 'filipp', 'marina'];

async function requestTts(apiKey: string, params: URLSearchParams) {
  return fetch(`${TTS_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${apiKey}` },
    signal: AbortSignal.timeout(45000),
  });
}

type TtsAttempt = { voice: YandexVoiceId; options: TtsOptions; label: string };

function buildTtsAttempts(
  primaryVoice: YandexVoiceId,
  baseOptions: TtsOptions,
): TtsAttempt[] {
  const attempts: TtsAttempt[] = [];
  const push = (voice: YandexVoiceId, options: TtsOptions, label: string) => {
    if (attempts.some((a) => a.voice === voice && a.options.speed === options.speed && a.options.emotion === options.emotion)) {
      return;
    }
    attempts.push({ voice, options, label });
  };

  push(primaryVoice, baseOptions, 'primary');

  if (baseOptions.emotion !== 'neutral') {
    push(primaryVoice, { ...baseOptions, emotion: 'neutral' }, 'neutral-emotion');
  }

  if (baseOptions.speed > 1.1) {
    push(primaryVoice, { ...baseOptions, speed: 1.05 }, 'speed-1.05');
    push(primaryVoice, { ...baseOptions, speed: 1.0, emotion: 'neutral' }, 'speed-1.0-neutral');
  }

  for (const fallbackVoice of TTS_FALLBACK_CHAIN) {
    if (fallbackVoice === primaryVoice) continue;
    push(
      fallbackVoice,
      { speed: Math.min(baseOptions.speed, 1.05), emotion: 'neutral' },
      `fallback-${fallbackVoice}`,
    );
  }

  return attempts;
}

/**
 * Synthesizes Russian speech via Yandex SpeechKit and saves OGG Opus to audio/.
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: YandexVoiceId,
  fileName: string,
  options: Partial<TtsOptions> & {
    artist?: string;
    title?: string;
    pauseProfile?: TtsPauseProfile;
    logContext?: YandexTtsLogContext;
  } = {},
): Promise<SynthesisResult> {
  const apiKey = process.env.YANDEX_API_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;

  if (!apiKey || !folderId) {
    throw new Error('YANDEX_API_KEY and YANDEX_FOLDER_ID are required');
  }

  const { logContext, artist, title, ...ttsPartial } = options;
  const ttsOptions: TtsOptions = {
    speed: ttsPartial.speed ?? DEFAULT_TTS_SPEED,
    emotion: ttsPartial.emotion ?? DEFAULT_TTS_EMOTION,
  };

  const installTag = logContext?.installId ? ` install=${logContext.installId.slice(0, 8)}` : '';
  const trackTag =
    logContext?.artist && logContext?.title
      ? ` track="${logContext.artist}" — "${logContext.title}"`
      : artist && title
        ? ` track="${artist}" — "${title}"`
        : '';

  const markedText = prepareYandexTtsText(text, {
    artist: artist ?? logContext?.artist,
    title: title ?? logContext?.title,
    sentencePauses: true,
    pauseProfile: options.pauseProfile ?? 'natural',
  });

  const primaryVoice = coerceVoiceForSpeechKit(voiceId);
  const attempts = buildTtsAttempts(primaryVoice, ttsOptions);

  console.log(
    `[yandex-tts] start${installTag}${trackTag} voice=${voiceId}→${primaryVoice} speed=${ttsOptions.speed} emotion=${ttsOptions.emotion} chars=${markedText.length} attempts=${attempts.length}`,
  );

  await mkdir(AUDIO_DIR, { recursive: true });

  const started = Date.now();
  let lastError = 'Yandex TTS failed';

  for (const attempt of attempts) {
    let params = buildTtsParams(markedText, attempt.voice, folderId, attempt.options);
    let response = await requestTts(apiKey, params);

    if (!response.ok && params.has('emotion') && attempt.options.emotion !== 'neutral') {
      params = buildTtsParams(markedText, attempt.voice, folderId, {
        ...attempt.options,
        emotion: 'neutral',
      });
      response = await requestTts(apiKey, params);
    }

    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const safeName = fileName.endsWith('.ogg') ? fileName : `${fileName}.ogg`;
      const filePath = path.join(AUDIO_DIR, safeName);
      await writeFile(filePath, buffer);

      console.log(
        `[yandex-tts] ok${installTag} attempt=${attempt.label} voice=${attempt.voice} speed=${attempt.options.speed} emotion=${attempt.options.emotion} bytes=${buffer.length} ms=${Date.now() - started}`,
      );

      if (attempt.voice !== voiceId || attempt.options.speed !== ttsOptions.speed) {
        console.warn(
          `[yandex-tts] adjusted${installTag} requested voice=${voiceId} speed=${ttsOptions.speed} emotion=${ttsOptions.emotion} → voice=${attempt.voice} speed=${attempt.options.speed} emotion=${attempt.options.emotion}`,
        );
      }

      return {
        fileName: safeName,
        filePath,
        audioUrl: `/audio/${safeName}`,
      };
    }

    const body = await response.text();
    lastError = `Yandex TTS error ${response.status}: ${body}`;
    console.warn(
      `[yandex-tts] fail${installTag} attempt=${attempt.label} voice=${attempt.voice} speed=${attempt.options.speed} emotion=${attempt.options.emotion} status=${response.status} ${summarizeYandexBody(body)}`,
    );

    if (!isRetryableTtsParamError(response.status, body)) {
      console.error(`[yandex-tts] abort${installTag} non-retryable: ${summarizeYandexBody(body, 300)}`);
      throw new Error(lastError);
    }
  }

  console.error(`[yandex-tts] exhausted${installTag} ms=${Date.now() - started} last=${summarizeYandexBody(lastError, 300)}`);
  throw new Error(lastError);
}

export type { TtsEmotion, TtsOptions };
