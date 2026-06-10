import { EdgeTTS } from 'edge-tts-universal';
import type { SileroVoiceId } from './silero-voices.js';
import type { ForeignLang } from './tts-foreign-lang.js';
import { resolveEdgeVoicePreset } from './edge-voices.js';

/** Пара Edge TTS под каждый Silero — тот же пол, темп и «характер». */
const EN_PROFILE_BY_SILERO: Record<
  SileroVoiceId,
  { voice: string; rateOffset: number; pitch: string; note: string }
> = {
  aidar: {
    voice: 'en-US-EricNeural',
    rateOffset: 0,
    pitch: '+0Hz',
    note: 'спокойный мужской',
  },
  eugene: {
    voice: 'en-US-ChristopherNeural',
    rateOffset: 6,
    pitch: '+1Hz',
    note: 'бодрый мужской (радио)',
  },
  baya: {
    voice: 'en-US-JennyNeural',
    rateOffset: 0,
    pitch: '+0Hz',
    note: 'спокойный женский',
  },
  kseniya: {
    voice: 'en-US-AriaNeural',
    rateOffset: 5,
    pitch: '+2Hz',
    note: 'живой женский',
  },
  xenia: {
    voice: 'en-US-AriaNeural',
    rateOffset: 5,
    pitch: '+2Hz',
    note: 'живой женский',
  },
};

function formatRatePercent(speed: number, offset = 0): string {
  const pct = Math.round((speed - 1) * 100) + offset;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct}%`;
}

export function resolveEdgeTtsVoiceForSilero(voice: SileroVoiceId, lang: ForeignLang = 'en'): string {
  const presetId = ({ aidar: 'dmitry_calm', eugene: 'dmitry_lively', baya: 'svetlana_calm', kseniya: 'svetlana_lively', xenia: 'svetlana_lively' } as const)[voice] ?? 'dmitry_calm';
  const preset = resolveEdgeVoicePreset(presetId);
  if (lang === 'de') return preset.deVoice;
  if (lang === 'fr') return preset.frVoice;
  return preset.enVoice;
}

export function resolveEdgeTtsDeliveryForSilero(
  sileroVoice: SileroVoiceId,
  speed = 1.0,
  lang: ForeignLang = 'en',
): { voice: string; rate: string; pitch: string } {
  const profile = EN_PROFILE_BY_SILERO[sileroVoice] ?? EN_PROFILE_BY_SILERO.aidar;
  const voice = resolveEdgeTtsVoiceForSilero(sileroVoice, lang);
  return {
    voice,
    rate: formatRatePercent(speed, profile.rateOffset),
    pitch: profile.pitch,
  };
}

/**
 * Короткие англ. фрагменты (артист, трек) — Edge TTS с тем же полом/темпом, что Silero.
 * Полное совпадение тембра невозможно (разные движки), но пары подобраны максимально близко.
 */
export async function synthesizeEnglishEdgeTts(
  text: string,
  sileroVoice: SileroVoiceId,
  options: { rate?: string; pitch?: string; speed?: number; lang?: ForeignLang } = {},
): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Edge TTS: empty foreign segment');

  const lang = options.lang ?? 'en';
  const delivery = resolveEdgeTtsDeliveryForSilero(sileroVoice, options.speed ?? 1.0, lang);
  const tts = new EdgeTTS(trimmed, delivery.voice, {
    rate: options.rate ?? delivery.rate,
    pitch: options.pitch ?? delivery.pitch,
  });
  const result = await tts.synthesize();
  const arrayBuffer = await result.audio.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  if (buf.length < 64) {
    throw new Error('Edge TTS: empty audio buffer');
  }
  return buf;
}
