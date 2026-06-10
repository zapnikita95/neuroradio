import { EdgeTTS } from 'edge-tts-universal';
import type { ForeignLang } from './tts-foreign-lang.js';
import { resolveEdgeVoicePreset, type EdgeVoicePresetId } from './edge-voices.js';

function formatRatePercent(speed: number, offset = 0): string {
  const pct = Math.round((speed - 1) * 100) + offset;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct}%`;
}

export function resolveEdgeTtsVoiceForPreset(presetId: EdgeVoicePresetId, lang: ForeignLang = 'en'): string {
  const preset = resolveEdgeVoicePreset(presetId);
  if (lang === 'de') return preset.deVoice;
  if (lang === 'fr') return preset.frVoice;
  return preset.enVoice;
}

export function resolveEdgeTtsDeliveryForPreset(
  presetId: EdgeVoicePresetId,
  speed = 1.0,
  lang: ForeignLang = 'en',
): { voice: string; rate: string; pitch: string } {
  const preset = resolveEdgeVoicePreset(presetId);
  return {
    voice: resolveEdgeTtsVoiceForPreset(presetId, lang),
    rate: formatRatePercent(speed, preset.rateOffsetPct),
    pitch: preset.pitch,
  };
}

/** Короткие иностранные фрагменты — Edge TTS по пресету Edge. */
export async function synthesizeEnglishEdgeTts(
  text: string,
  edgePreset: EdgeVoicePresetId,
  options: { rate?: string; pitch?: string; speed?: number; lang?: ForeignLang } = {},
): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Edge TTS: empty foreign segment');

  const lang = options.lang ?? 'en';
  const delivery = resolveEdgeTtsDeliveryForPreset(edgePreset, options.speed ?? 1.0, lang);
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