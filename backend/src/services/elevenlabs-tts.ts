import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { AUDIO_DIR, type SynthesisResult } from './yandex-tts.js';
import { isElevenLabsEnabled } from './entitlements.js';

const ELEVEN_API = 'https://api.elevenlabs.io/v1/text-to-speech';

export function hasElevenLabsCredentials(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export function canUseElevenLabsProduction(): boolean {
  return hasElevenLabsCredentials() && isElevenLabsEnabled();
}

export interface ElevenLabsSynthesisOptions {
  voiceId?: string;
  modelId?: string;
  artist?: string;
  title?: string;
}

/**
 * Premium TTS adapter (scaffold). Enabled only when ELEVENLABS_ENABLED=true and API key is set.
 */
export async function synthesizeSpeechElevenLabs(
  text: string,
  fileName: string,
  options: ElevenLabsSynthesisOptions = {},
): Promise<SynthesisResult> {
  if (!canUseElevenLabsProduction()) {
    throw new Error(
      'ElevenLabs premium TTS is not enabled. Set ELEVENLABS_API_KEY and ELEVENLABS_ENABLED=true.',
    );
  }

  const apiKey = process.env.ELEVENLABS_API_KEY!.trim();
  const voiceId =
    options.voiceId?.trim() ||
    process.env.ELEVENLABS_VOICE_ID?.trim() ||
    'pNInz6obpgDQGcFmaJgB';
  const modelId =
    options.modelId?.trim() ||
    process.env.ELEVENLABS_MODEL_ID?.trim() ||
    'eleven_flash_v2_5';

  await mkdir(AUDIO_DIR, { recursive: true });

  const response = await fetch(`${ELEVEN_API}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/ogg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.78,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs TTS error ${response.status}: ${body.slice(0, 240)}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const safeName = fileName.endsWith('.ogg') ? fileName : `${fileName}.ogg`;
  const filePath = path.join(AUDIO_DIR, safeName);
  await writeFile(filePath, buffer);

  console.log(
    `[elevenlabs-tts] ok voice=${voiceId} model=${modelId} bytes=${buffer.length} chars=${text.length}`,
  );

  return {
    fileName: safeName,
    filePath,
    audioUrl: `/audio/${safeName}`,
  };
}
