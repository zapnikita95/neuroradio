import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EdgeTTS } from 'edge-tts-universal';
import { concatAudioBuffersToWav } from './audio-concat.js';
import { resolveEdgeVoicePreset, type EdgeVoicePresetId } from './edge-voices.js';
import {
  ensureEdgeLatinCitationOpener,
  prepareEdgeTtsText,
} from './tts-edge-prepare.js';
import {
  hasForeignSegmentsForEdge,
  splitMixedLanguageForEdge,
} from './tts-mixed-segments.js';
import { prepareEdgeRussianSegment } from './tts-edge-normalize.js';
import { AUDIO_DIR, type SynthesisResult } from './yandex-tts.js';

function formatRatePercent(speed: number, offsetPct = 0): string {
  const pct = Math.round((speed - 1) * 100) + offsetPct;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct}%`;
}

async function synthEdgeSegment(
  text: string,
  voice: string,
  rate: string,
  pitch: string,
): Promise<Buffer> {
  const trimmed = text.trim();
  if (!trimmed) return Buffer.alloc(0);
  const tts = new EdgeTTS(trimmed, voice, { rate, pitch });
  const buf = Buffer.from(await (await tts.synthesize()).audio.arrayBuffer());
  if (buf.length < 64) throw new Error('Edge TTS: empty audio buffer');
  return buf;
}

function edgeVoiceForLang(
  lang: 'ru' | 'en' | 'de' | 'fr',
  preset: ReturnType<typeof resolveEdgeVoicePreset>,
): string {
  if (lang === 'de') return preset.deVoice;
  if (lang === 'fr') return preset.frVoice;
  if (lang === 'en') return preset.enVoice;
  return preset.ruVoice;
}

function prepareEdgeSegments(
  script: string,
  artist: string,
  title: string,
  speakTrackNamesInVoiceover: boolean,
): Array<{ lang: 'ru' | 'en' | 'de' | 'fr'; text: string }> {
  const source = ensureEdgeLatinCitationOpener(
    script.trim(),
    artist,
    title,
    speakTrackNamesInVoiceover,
  );
  const prepared = prepareEdgeTtsText(source, {
    artist,
    title,
    speakTrackNamesInVoiceover,
  });

  if (!hasForeignSegmentsForEdge(prepared, artist, title)) {
    return [{ lang: 'ru', text: prepareEdgeRussianSegment(prepared) }];
  }

  return splitMixedLanguageForEdge(prepared, artist, title).map((seg) =>
    seg.lang === 'ru'
      ? { ...seg, text: prepareEdgeRussianSegment(seg.text) }
      : seg,
  );
}

export interface EdgeSynthesisOptions {
  artist?: string;
  title?: string;
  voicePreset?: EdgeVoicePresetId | string;
  speed?: number;
  speakTrackNamesInVoiceover?: boolean;
}

export async function synthesizeSpeechEdge(
  script: string,
  fileName: string,
  options: EdgeSynthesisOptions = {},
): Promise<SynthesisResult> {
  const artist = options.artist ?? '';
  const title = options.title ?? '';
  const preset = resolveEdgeVoicePreset(options.voicePreset);
  const speed = options.speed ?? 1.15;
  const rate = formatRatePercent(speed, preset.rateOffsetPct);
  const pitch = preset.pitch;
  const speakNamesExplicit = options.speakTrackNamesInVoiceover === true;

  const segments = prepareEdgeSegments(
    script,
    artist,
    title,
    speakNamesExplicit,
  );

  const bufs: Buffer[] = [];
  for (const seg of segments) {
    if (!seg.text.trim()) continue;
    bufs.push(
      await synthEdgeSegment(
        seg.text,
        edgeVoiceForLang(seg.lang, preset),
        rate,
        pitch,
      ),
    );
  }

  await mkdir(AUDIO_DIR, { recursive: true });
  const filePath = path.join(AUDIO_DIR, fileName);
  const merged = await concatAudioBuffersToWav(bufs.filter((b) => b.length > 64), filePath);
  if (!merged) {
    await writeFile(filePath, bufs[0]!);
  }

  const transcriptSegments = prepareEdgeSegments(
    script,
    artist,
    title,
    speakNamesExplicit,
  );
  const ttsTranscript = transcriptSegments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();

  return {
    fileName,
    filePath,
    audioUrl: `/audio/${fileName}`,
    ttsTranscript,
  };
}
