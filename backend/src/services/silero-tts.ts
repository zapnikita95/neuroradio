import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch';
import { prepareSileroTtsText } from './tts-markup.js';
import { AUDIO_DIR, type SynthesisResult } from './yandex-tts.js';

export type SileroVoiceId = 'aidar' | 'baya' | 'kseniya' | 'xenia' | 'eugene';

const DEFAULT_SILERO_VOICE: SileroVoiceId = 'baya';

export function getSileroTtsBaseUrl(): string | null {
  const raw = process.env.SILERO_TTS_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

export function isSileroTtsEnabled(): boolean {
  return process.env.SILERO_TTS_ENABLED?.trim() === 'true';
}

export function canUseSileroTts(): boolean {
  return isSileroTtsEnabled() && Boolean(getSileroTtsBaseUrl());
}

export function resolveSileroVoice(): SileroVoiceId {
  const raw = process.env.SILERO_TTS_VOICE?.trim().toLowerCase();
  const allowed: SileroVoiceId[] = ['aidar', 'baya', 'kseniya', 'xenia', 'eugene'];
  if (raw && allowed.includes(raw as SileroVoiceId)) {
    return raw as SileroVoiceId;
  }
  return DEFAULT_SILERO_VOICE;
}

type SileroApiMode = 'openai' | 'legacy';

function resolveSileroApiMode(): SileroApiMode {
  const forced = process.env.SILERO_TTS_API?.trim().toLowerCase();
  if (forced === 'legacy' || forced === 'openai') return forced;
  return 'openai';
}

async function synthesizeViaOpenAi(
  baseUrl: string,
  plainText: string,
  voice: SileroVoiceId,
): Promise<Buffer> {
  const response = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: plainText.slice(0, 4096),
      voice,
      response_format: 'ogg',
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 400);
    throw new Error(`Silero OpenAI API HTTP ${response.status}: ${body}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function synthesizeViaLegacy(
  baseUrl: string,
  plainText: string,
  voice: SileroVoiceId,
): Promise<Buffer> {
  const url =
    `${baseUrl}/process?VOICE=${encodeURIComponent(voice)}` +
    `&INPUT_TEXT=${encodeURIComponent(plainText.slice(0, 4096))}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 400);
    throw new Error(`Silero legacy API HTTP ${response.status}: ${body}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** GET /docs or OpenAI /v1/audio/speech — silero-api-server. */
export async function probeSileroTtsHealth(baseUrl?: string): Promise<boolean> {
  const url = (baseUrl ?? getSileroTtsBaseUrl())?.replace(/\/$/, '');
  if (!url) return false;
  try {
    const voices = await fetch(`${url}/voices`, { signal: AbortSignal.timeout(5000) });
    if (voices.ok) return true;
    const models = await fetch(`${url}/tts/model`, { signal: AbortSignal.timeout(5000) });
    return models.ok;
  } catch {
    return false;
  }
}

export interface SileroSynthesisOptions {
  artist?: string;
  title?: string;
  voice?: SileroVoiceId;
}

/**
 * Local Silero v5_ru via silero-api-server (OpenAI-compatible /v1/audio/speech).
 * @see backend/SILERO_LOCAL.md
 */
export async function synthesizeSpeechSilero(
  script: string,
  fileName: string,
  options: SileroSynthesisOptions = {},
): Promise<SynthesisResult> {
  const baseUrl = getSileroTtsBaseUrl();
  if (!baseUrl || !isSileroTtsEnabled()) {
    throw new Error(
      'Silero TTS не включён. SILERO_TTS_ENABLED=true и SILERO_TTS_URL=http://127.0.0.1:8001',
    );
  }

  const artist = options.artist ?? '';
  const title = options.title ?? '';
  const voice = options.voice ?? resolveSileroVoice();
  const plainText = prepareSileroTtsText(script, { artist, title });
  if (!plainText.trim()) {
    throw new Error('Silero TTS: пустой текст после подготовки');
  }

  const apiMode = resolveSileroApiMode();
  const synthStarted = Date.now();
  let buffer: Buffer;
  try {
    buffer =
      apiMode === 'legacy'
        ? await synthesizeViaLegacy(baseUrl, plainText, voice)
        : await synthesizeViaOpenAi(baseUrl, plainText, voice);
  } catch (openAiErr) {
    if (apiMode === 'openai') {
      console.warn('[silero-tts] OpenAI API failed, trying legacy /process');
      buffer = await synthesizeViaLegacy(baseUrl, plainText, voice);
    } else {
      throw openAiErr;
    }
  }

  if (buffer.length < 64) {
    throw new Error('Silero TTS: пустой аудио-ответ');
  }

  await mkdir(AUDIO_DIR, { recursive: true });
  const filePath = path.join(AUDIO_DIR, fileName);
  const transcriptPath = filePath.replace(/\.(wav|ogg|opus)$/i, '.txt');
  await writeFile(filePath, buffer);
  await writeFile(
    transcriptPath,
    [
      `# Silero TTS transcript`,
      `# artist=${artist || '-'} title=${title || '-'}`,
      `# voice=${voice} chars=${plainText.length} ms=${Date.now() - synthStarted}`,
      '',
      plainText,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(
    `[silero-tts] ok voice=${voice} chars=${plainText.length} bytes=${buffer.length} ms=${Date.now() - synthStarted} transcript=${transcriptPath}`,
  );
  console.log(`[silero-tts] text-begin\n${plainText}\n[silero-tts] text-end`);

  return {
    fileName,
    filePath,
    audioUrl: `/audio/${fileName}`,
  };
}
