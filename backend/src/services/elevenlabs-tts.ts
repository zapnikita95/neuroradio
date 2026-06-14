import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { AUDIO_DIR, type SynthesisResult, type YandexTtsLogContext } from './yandex-tts.js';
import { isElevenLabsEnabled } from './entitlements.js';
import { concatAudioBuffersToWav } from './audio-concat.js';
import {
  buildElevenLabsSpeechPlan,
  elevenLabsLanguageCode,
  formatElevenLabsTranscriptForLog,
  resolveElevenLabsModelForMixed,
  type ElevenLabsSegment,
} from './elevenlabs-text.js';
import fetch from '../proxy-fetch.js';

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
  logContext?: YandexTtsLogContext;
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

async function synthesizeForeignSegments(
  apiKey: string,
  voiceId: string,
  modelId: string,
  segments: ElevenLabsSegment[],
  filePath: string,
  installTag: string,
  trackTag: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for (const seg of segments) {
    if (!seg.text.trim()) continue;
    const langCode = elevenLabsLanguageCode(seg.lang);
    console.log(
      `[elevenlabs-tts] segment${installTag}${trackTag} lang=${langCode} chars=${seg.text.length} text="${seg.text}"`,
    );
    chunks.push(await fetchElevenChunk(apiKey, voiceId, modelId, seg.text, langCode));
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

function buildLogTags(
  logContext: YandexTtsLogContext | undefined,
  artist: string,
  title: string,
): { installTag: string; trackTag: string } {
  const installTag = logContext?.installId ? ` install=${logContext.installId.slice(0, 8)}` : '';
  const trackArtist = logContext?.artist ?? artist;
  const trackTitle = logContext?.title ?? title;
  const trackTag =
    trackArtist && trackTitle ? ` track="${trackArtist}" — "${trackTitle}"` : '';
  return { installTag, trackTag };
}

/**
 * English premium TTS (ElevenLabs). DE/FR artist/track names get language_code de/fr; rest is en.
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
  const { installTag, trackTag } = buildLogTags(options.logContext, artist, title);

  const plan = buildElevenLabsSpeechPlan(text, artist, title, speakNames);
  const modelId = resolveElevenLabsModelForMixed(plan.useForeignSegments, options.modelId);
  const logCard = formatElevenLabsTranscriptForLog(plan.segments);

  console.log(
    `[elevenlabs-tts] start${installTag}${trackTag} voice=${voiceId} model=${modelId} foreign=${plan.useForeignSegments} segments=${plan.segments.length} chars=${plan.ttsTranscript.length}`,
  );
  console.log(
    `[elevenlabs-tts] speech-text-begin${installTag}${trackTag}\n${logCard}\n[elevenlabs-tts] speech-text-end`,
  );

  await mkdir(AUDIO_DIR, { recursive: true });
  const safeName = fileName.endsWith('.ogg') ? fileName.replace(/\.ogg$/, '.wav') : fileName;
  const wavName = safeName.endsWith('.wav') ? safeName : `${safeName}.wav`;
  const filePath = path.join(AUDIO_DIR, wavName);

  let buffer: Buffer;

  if (plan.useForeignSegments) {
    buffer = await synthesizeForeignSegments(
      apiKey,
      voiceId,
      modelId,
      plan.segments,
      filePath,
      installTag,
      trackTag,
    );
  } else {
    const plainText = plan.segments[0]?.text ?? plan.ttsTranscript;
    buffer = await fetchElevenChunk(apiKey, voiceId, modelId, plainText, 'en');
    await writeFile(filePath, buffer);
  }

  console.log(
    `[elevenlabs-tts] ok${installTag}${trackTag} voice=${voiceId} model=${modelId} foreign=${plan.useForeignSegments} bytes=${buffer.length}`,
  );

  return {
    fileName: wavName,
    filePath,
    audioUrl: `/audio/${wavName}`,
    ttsTranscript: plan.ttsTranscript,
  };
}
