import fetch from '../proxy-fetch.js';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { AUDIO_DIR, type SynthesisResult } from './yandex-tts.js';
import { isAzureSpeechEnabled } from './entitlements.js';
import {
  buildAzureSsml,
  preparePlainSpeechText,
  resolveAzureVoiceForStyle,
  yandexSpeedToAzureRate,
  type AzureRuVoiceId,
} from './tts-azure-ssml.js';
import type { TtsPauseProfile } from './tts-voice-profiles.js';
import type { StoryNarratorId } from './story-narrator.js';

export function hasAzureSpeechCredentials(): boolean {
  return Boolean(
    process.env.AZURE_SPEECH_KEY?.trim() && process.env.AZURE_SPEECH_REGION?.trim(),
  );
}

export function canUseAzureSpeechProduction(): boolean {
  return hasAzureSpeechCredentials() && isAzureSpeechEnabled();
}

function ttsEndpoint(region: string): string {
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

export interface AzureSynthesisOptions {
  artist?: string;
  title?: string;
  speed?: number;
  pauseProfile?: TtsPauseProfile;
  styleId?: string;
  storyNarrator?: StoryNarratorId;
  voice?: AzureRuVoiceId;
  speakTrackNamesInVoiceover?: boolean;
}

/**
 * Azure Neural TTS (ru-RU) — premium-quality native Russian.
 */
export async function synthesizeSpeechAzure(
  script: string,
  fileName: string,
  options: AzureSynthesisOptions = {},
): Promise<SynthesisResult> {
  if (!canUseAzureSpeechProduction()) {
    throw new Error(
      'Azure Speech TTS is not enabled. Set AZURE_SPEECH_KEY, AZURE_SPEECH_REGION, and AZURE_SPEECH_ENABLED=true.',
    );
  }

  const apiKey = process.env.AZURE_SPEECH_KEY!.trim();
  const region = process.env.AZURE_SPEECH_REGION!.trim();
  const artist = options.artist ?? '';
  const title = options.title ?? '';
  const speed = options.speed ?? 0.92;
  const voice =
    options.voice ??
    resolveAzureVoiceForStyle(options.styleId ?? 'auto', options.storyNarrator ?? 'auto');

  const plainText = preparePlainSpeechText(
    script,
    artist,
    title,
    options.speakTrackNamesInVoiceover === true,
  );
  const ssml = buildAzureSsml(plainText, {
    voice,
    rate: yandexSpeedToAzureRate(speed),
    pauseProfile: options.pauseProfile,
  });

  await mkdir(AUDIO_DIR, { recursive: true });

  const outputFormat =
    process.env.AZURE_SPEECH_OUTPUT_FORMAT?.trim() ||
    'audio-ogg-48khz-16bit-mono-opus';

  const response = await fetch(ttsEndpoint(region), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': outputFormat,
      'User-Agent': 'music-story-bff',
    },
    body: ssml,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Azure Speech TTS error ${response.status}: ${body.slice(0, 280)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const safeName = fileName.endsWith('.ogg') ? fileName : `${fileName}.ogg`;
  const filePath = path.join(AUDIO_DIR, safeName);
  await writeFile(filePath, buffer);

  console.log(
    `[azure-tts] ok region=${region} voice=${voice} rate=${yandexSpeedToAzureRate(speed)} bytes=${buffer.length} chars=${plainText.length}`,
  );

  return {
    fileName: safeName,
    filePath,
    audioUrl: `/audio/${safeName}`,
  };
}
