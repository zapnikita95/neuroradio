import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EdgeTTS } from 'edge-tts-universal';
import { concatAudioBuffersToWav } from './audio-concat.js';
import { resolveEdgeVoicePreset, type EdgeVoicePresetId } from './edge-voices.js';
import { prepareYandexTtsText } from './tts-markup.js';
import { mergeLatinTitleOtArtist } from './tts-yandex-ssml.js';
import { splitMixedLanguageForEdge } from './tts-mixed-segments.js';
import { prepareEdgeRussianSegment } from './tts-edge-normalize.js';
import { scriptContainsLatinTrackCitation } from './tts-generic-script.js';
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

function prepareEdgeRuText(script: string, speakTrackNamesInVoiceover = false): string {
  const marked = prepareYandexTtsText(script, {
    sentencePauses: false,
    speakTrackNamesInVoiceover,
  });
  return prepareEdgeRussianSegment(marked);
}

function prepareEdgeMixedText(script: string, artist: string, title: string): string {
  const marked = prepareYandexTtsText(script, { artist, title, sentencePauses: false });
  const merged = mergeLatinTitleOtArtist(
    marked.replace(/<\[[^\]]+\]>/g, ' ').replace(/\s+/g, ' ').trim(),
  );
  return merged
    .split(/(\s+)/)
    .map((part) => (/[а-яё]/i.test(part) ? prepareEdgeRussianSegment(part) : part))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
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
  const speakNames =
    speakNamesExplicit ||
    (Boolean(artist && title) && scriptContainsLatinTrackCitation(script, artist, title));

  let source = script.trim();

  const bufs: Buffer[] = [];

  if (speakNames && artist && title) {
    const mixed = prepareEdgeMixedText(source, artist, title);
    const segments = splitMixedLanguageForEdge(mixed, artist, title).map((seg) =>
      seg.lang === 'ru'
        ? { ...seg, text: prepareEdgeRussianSegment(seg.text.replace(/\+/g, '')) }
        : seg,
    );
    for (const seg of segments) {
      if (!seg.text.trim()) continue;
      bufs.push(
        await synthEdgeSegment(
          seg.text,
          seg.lang === 'de'
            ? preset.deVoice
            : seg.lang === 'fr'
              ? preset.frVoice
              : seg.lang === 'en'
                ? preset.enVoice
                : preset.ruVoice,
          rate,
          pitch,
        ),
      );
    }
  } else {
    const ruText = prepareEdgeRuText(source, speakNames);
    bufs.push(await synthEdgeSegment(ruText, preset.ruVoice, rate, pitch));
  }

  await mkdir(AUDIO_DIR, { recursive: true });
  const filePath = path.join(AUDIO_DIR, fileName);
  const merged = await concatAudioBuffersToWav(bufs.filter((b) => b.length > 64), filePath);
  if (!merged) {
    await writeFile(filePath, bufs[0]!);
  }

  return {
    fileName,
    filePath,
    audioUrl: `/audio/${fileName}`,
    ttsTranscript: speakNames ? prepareEdgeMixedText(source, artist, title) : prepareEdgeRuText(source, false),
  };
}
