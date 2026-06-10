import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { AUDIO_DIR, type SynthesisResult } from './yandex-tts.js';
import { isElevenLabsEnabled } from './entitlements.js';
import { concatAudioBuffersToWav } from './audio-concat.js';
import {
  elevenLabsLanguageCode,
  prepareElevenLabsMixedSegments,
  resolveElevenLabsModelForMixed,
  shouldUseElevenLabsMixedSegments,
} from './elevenlabs-text.js';
import { preparePlainSpeechText } from './tts-azure-ssml.js';
import { applyEnglishArtistPronunciation } from './artist-pronunciation.js';
import type { MixedLangSegment } from './tts-mixed-segments.js';

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
  speakTrackNamesInVoiceover?: boolean;
  storyLanguage?: 'ru' | 'en';
}

async function fetchElevenChunk(
  apiKey: string,
  voiceId: string,
  modelId: string,
  text: string,
  languageCode: string,
): Promise<Buffer> {
  const response = await fetch(`${ELEVEN_API}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      language_code: languageCode,
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

  return Buffer.from(await response.arrayBuffer());
}

async function synthesizeMixedSegments(
  apiKey: string,
  voiceId: string,
  modelId: string,
  segments: MixedLangSegment[],
  filePath: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (const seg of segments) {
    if (!seg.text.trim()) continue;
    const langCode = elevenLabsLanguageCode(seg.lang);
    chunks.push(await fetchElevenChunk(apiKey, voiceId, modelId, seg.text, langCode));
    console.log(
      `[elevenlabs-tts] segment lang=${langCode} chars=${seg.text.length} preview="${seg.text.slice(0, 48)}"`,
    );
  }

  if (chunks.length === 0) {
    throw new Error('ElevenLabs TTS: no audio segments');
  }

  const merged = await concatAudioBuffersToWav(chunks, filePath);
  if (merged) {
    const { readFile } = await import('node:fs/promises');
    return readFile(filePath);
  }
  return chunks[0]!;
}

/**
 * Premium TTS: multilingual v2 + language_code per segment (ru/en/de/fr).
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

  const artist = options.artist ?? '';
  const title = options.title ?? '';
  const speakNames = options.speakTrackNamesInVoiceover === true;

  const useMixed =
    speakNames &&
    Boolean(artist && title) &&
    shouldUseElevenLabsMixedSegments(text, artist, title, speakNames);

  const modelId = resolveElevenLabsModelForMixed(useMixed, options.modelId);

  await mkdir(AUDIO_DIR, { recursive: true });
  const safeName = fileName.endsWith('.ogg') ? fileName.replace(/\.ogg$/, '.wav') : fileName;
  const wavName = safeName.endsWith('.wav') ? safeName : `${safeName}.wav`;
  const filePath = path.join(AUDIO_DIR, wavName);

  let buffer: Buffer;

  if (useMixed) {
    const segments = prepareElevenLabsMixedSegments(text, artist, title);
    console.log(
      `[elevenlabs-tts] mixed segments=${segments.length} model=${modelId} ` +
        segments.map((s) => `${s.lang}:${s.text.slice(0, 20)}`).join(' | '),
    );
    buffer = await synthesizeMixedSegments(apiKey, voiceId, modelId, segments, filePath);
  } else {
    let plainText = preparePlainSpeechText(text, artist, title, speakNames);
    plainText = applyEnglishArtistPronunciation(plainText, artist, title);
    const langCode =
      options.storyLanguage === 'en' ? 'en' : 'ru';
    buffer = await fetchElevenChunk(apiKey, voiceId, modelId, plainText, langCode);
    await writeFile(filePath, buffer);
  }

  console.log(
    `[elevenlabs-tts] ok voice=${voiceId} model=${modelId} mixed=${useMixed} bytes=${buffer.length}`,
  );

  return {
    fileName: wavName,
    filePath,
    audioUrl: `/audio/${wavName}`,
  };
}
