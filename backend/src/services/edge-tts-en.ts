import { EdgeTTS } from 'edge-tts-universal';
import type { SileroVoiceId } from './silero-voices.js';

const EN_VOICE_BY_SILERO: Record<SileroVoiceId, string> = {
  aidar: 'en-US-GuyNeural',
  baya: 'en-US-JennyNeural',
  kseniya: 'en-US-AriaNeural',
  xenia: 'en-US-AriaNeural',
  eugene: 'en-US-ChristopherNeural',
};

export function resolveEdgeTtsVoiceForSilero(voice: SileroVoiceId): string {
  return EN_VOICE_BY_SILERO[voice] ?? 'en-US-GuyNeural';
}

/** Real English pronunciation for Latin artist/title phrases (Microsoft Edge TTS, no API key). */
export async function synthesizeEnglishEdgeTts(
  text: string,
  sileroVoice: SileroVoiceId,
  options: { rate?: string; pitch?: string } = {},
): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Edge TTS: empty English segment');

  const voice = resolveEdgeTtsVoiceForSilero(sileroVoice);
  const tts = new EdgeTTS(trimmed, voice, {
    rate: options.rate ?? '+4.00%',
    pitch: options.pitch ?? '+2Hz',
  });
  const result = await tts.synthesize();
  const arrayBuffer = await result.audio.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  if (buf.length < 64) {
    throw new Error('Edge TTS: empty audio buffer');
  }
  return buf;
}
