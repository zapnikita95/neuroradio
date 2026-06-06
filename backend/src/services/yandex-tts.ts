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
import { stripYandexMarkup } from './tts-azure-ssml.js';
import { buildYandexSsml, hasLatinForSsml } from './tts-yandex-ssml.js';
import type { TtsPauseProfile } from './tts-voice-profiles.js';

const TTS_URL = 'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize';
const YANDEX_LPCM_SAMPLE_RATE = 48_000;

export type YandexAudioFormat = 'oggopus' | 'lpcm-wav';

/** WAV by default — Android ExoPlayer reliably plays PCM WAV; oggopus fails on some devices. */
export function resolveYandexAudioFormat(): YandexAudioFormat {
  const fmt = process.env.YANDEX_TTS_FORMAT?.trim().toLowerCase();
  if (fmt === 'ogg' || fmt === 'oggopus') return 'oggopus';
  if (fmt === 'wav' || fmt === 'lpcm' || fmt === 'lpcm-wav') return 'lpcm-wav';
  return 'lpcm-wav';
}

export function yandexAudioExtension(format: YandexAudioFormat = resolveYandexAudioFormat()): 'ogg' | 'wav' {
  return format === 'lpcm-wav' ? 'wav' : 'ogg';
}

function wrapPcmAsWav(pcm: Buffer, sampleRate = YANDEX_LPCM_SAMPLE_RATE): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.resolve(__dirname, '../../data');
export const AUDIO_DIR = process.env.AUDIO_DATA_DIR?.trim()
  ? path.resolve(process.env.AUDIO_DATA_DIR.trim())
  : path.join(DATA_DIR, 'audio');

export interface SynthesisResult {
  fileName: string;
  filePath: string;
  audioUrl: string;
  /** Plain text sent to TTS (years as words, stress +, no pause markup). */
  ttsTranscript?: string;
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
    /unsupported ssml|ssml tag/i.test(lower) ||
    /speed|tempo|rate/i.test(lower) ||
    /emotion/i.test(lower) ||
    /invalid.*parameter/i.test(lower)
  );
}

function buildTtsParams(
  markedText: string,
  voiceId: YandexVoiceId,
  folderId: string,
  options: TtsOptions,
  audioFormat: YandexAudioFormat = resolveYandexAudioFormat(),
): URLSearchParams {
  const useSsml = hasLatinForSsml(markedText);
  const params = new URLSearchParams({
    lang: 'ru-RU',
    voice: voiceId,
    format: audioFormat === 'lpcm-wav' ? 'lpcm' : 'oggopus',
    folderId,
    speed: String(options.speed),
  });
  if (audioFormat === 'lpcm-wav') {
    params.set('sampleRateHertz', String(YANDEX_LPCM_SAMPLE_RATE));
  }

  if (useSsml) {
    params.set('ssml', buildYandexSsml(markedText, voiceId));
  } else {
    params.set('text', markedText);
  }

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

  for (const fallbackVoice of TTS_FALLBACK_CHAIN) {
    if (fallbackVoice === primaryVoice) continue;
    push(
      fallbackVoice,
      { ...baseOptions, emotion: 'neutral' },
      `fallback-${fallbackVoice}`,
    );
  }

  return attempts;
}

/**
 * Synthesizes Russian speech via Yandex SpeechKit and saves WAV (default) or OGG to audio/.
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
    credentials?: { apiKey: string; folderId: string };
  } = {},
): Promise<SynthesisResult> {
  const apiKey = options.credentials?.apiKey ?? process.env.YANDEX_API_KEY;
  const folderId = options.credentials?.folderId ?? process.env.YANDEX_FOLDER_ID;

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
    pauseProfile: options.pauseProfile ?? 'tight',
  });
  const ttsTranscript = stripYandexMarkup(markedText);

  const primaryVoice = coerceVoiceForSpeechKit(voiceId);
  const audioFormat = resolveYandexAudioFormat();
  const audioExt = yandexAudioExtension(audioFormat);
  const attempts = buildTtsAttempts(primaryVoice, ttsOptions);

  console.log(
    `[yandex-tts] start${installTag}${trackTag} voice=${voiceId}→${primaryVoice} speed=${ttsOptions.speed} emotion=${ttsOptions.emotion} format=${audioFormat} chars=${markedText.length} ssml=${hasLatinForSsml(markedText)} attempts=${attempts.length} billing=${options.credentials ? 'client' : 'server'}`,
  );
  console.log(`[yandex-tts] marked-text-begin${installTag}${trackTag}\n${markedText}\n[yandex-tts] marked-text-end`);
  if (hasLatinForSsml(markedText)) {
    console.log(
      `[yandex-tts] ssml-begin${installTag}${trackTag}\n${buildYandexSsml(markedText, primaryVoice)}\n[yandex-tts] ssml-end`,
    );
  }

  await mkdir(AUDIO_DIR, { recursive: true });

  const started = Date.now();
  let lastError = 'Yandex TTS failed';

  for (const attempt of attempts) {
    let params = buildTtsParams(markedText, attempt.voice, folderId, attempt.options, audioFormat);
    let response = await requestTts(apiKey, params);

    if (!response.ok && params.has('emotion') && attempt.options.emotion !== 'neutral') {
      params = buildTtsParams(markedText, attempt.voice, folderId, {
        ...attempt.options,
        emotion: 'neutral',
      }, audioFormat);
      response = await requestTts(apiKey, params);
    }

    if (response.ok) {
      const raw = Buffer.from(await response.arrayBuffer());
      const buffer = audioFormat === 'lpcm-wav' ? wrapPcmAsWav(raw) : raw;
      const baseName = fileName.replace(/\.(ogg|wav)$/i, '');
      const safeName = `${baseName}.${audioExt}`;
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
        ttsTranscript,
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
