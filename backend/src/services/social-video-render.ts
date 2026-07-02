import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesizeSpeechEdge } from './edge-tts-story.js';
import type { StoryLanguageId } from './story-language.js';
import type { StoryNarratorId } from './story-narrator.js';
import type { EdgeVoicePresetId } from './edge-voices.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const WORK_DIR =
  process.env.SOCIAL_VIDEO_WORK_DIR?.trim() ||
  path.join(process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data'), 'social-video');

const NARRATOR_EDGE: Record<string, EdgeVoicePresetId> = {
  radio_host: 'dmitry_lively',
  night_dj: 'dmitry_lively',
  contemporary: 'svetlana_lively',
  fan: 'svetlana_lively',
  expert: 'dmitry_calm',
  backstage: 'dmitry_calm',
  auto: 'dmitry_lively',
};

function personaImagePath(narrator: StoryNarratorId): string | null {
  const id = narrator === 'auto' ? 'radio_host' : narrator;
  const candidates = [
    path.join(REPO_ROOT, 'play-store', 'personas-round', `persona-${id}-round-512.png`),
    path.join(REPO_ROOT, 'play-store', 'personas-round', `persona-${id}-round.png`),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

function buildSrt(voicedText: string, durationSec: number): string {
  const sentences = voicedText
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  if (sentences.length === 0) return '';
  const slice = durationSec / sentences.length;
  return sentences
    .map((line, i) => {
      const start = i * slice;
      const end = Math.min(durationSec - 0.05, (i + 1) * slice);
      const fmt = (t: number) => {
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const s = Math.floor(t % 60);
        const ms = Math.floor((t % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };
      return `${i + 1}\n${fmt(start)} --> ${fmt(end)}\n${line}\n`;
    })
    .join('\n');
}

async function probeDurationSec(wavPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      wavPath,
    ]);
    let out = '';
    proc.stdout?.on('data', (c) => {
      out += String(c);
    });
    proc.on('close', () => {
      const n = parseFloat(out.trim());
      resolve(Number.isFinite(n) && n > 0 ? n : 30);
    });
    proc.on('error', () => resolve(30));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.env.FFMPEG_PATH?.trim() || 'ffmpeg', args, { stdio: 'ignore' });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}`));
    });
  });
}

export function isSocialVideoEnabled(): boolean {
  return process.env.SOCIAL_VIDEO_ENABLED?.trim() !== 'false';
}

export interface SocialVideoInput {
  artist: string;
  title: string;
  voicedText: string;
  narrator: StoryNarratorId;
  lang: StoryLanguageId;
  jobId: string;
}

/** Vertical 1080×1920 MP4: gradient + persona + title + TTS + subtitles. No track audio. */
export async function renderSocialStoryVideo(input: SocialVideoInput): Promise<string | null> {
  if (!isSocialVideoEnabled()) return null;

  fs.mkdirSync(WORK_DIR, { recursive: true });
  const base = path.join(WORK_DIR, input.jobId.replace(/[^\w-]/g, '_'));
  const wavPath = `${base}.wav`;
  const srtPath = `${base}.srt`;
  const mp4Path = `${base}.mp4`;

  try {
    const edgePreset = NARRATOR_EDGE[input.narrator] ?? 'dmitry_lively';
    const synth = await synthesizeSpeechEdge(input.voicedText, path.basename(wavPath), {
      artist: input.artist,
      title: input.title,
      voicePreset: edgePreset,
      speed: 1.08,
      speakTrackNamesInVoiceover: true,
    });
    if (!fs.existsSync(synth.filePath)) {
      console.warn('[social-video] wav missing after TTS');
      return null;
    }
    fs.copyFileSync(synth.filePath, wavPath);

    const duration = await probeDurationSec(wavPath);
    fs.writeFileSync(srtPath, buildSrt(input.voicedText, duration), 'utf8');

    const persona = personaImagePath(input.narrator);
    const titleLine = escapeDrawtext(`${input.title} — ${input.artist}`.slice(0, 80));
    const brandLine = escapeDrawtext('Эфир AI · efir-ai.ru');

    const filters: string[] = [
      `[0:v]drawtext=fontfile=/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf:text='${titleLine}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=120:box=1:boxcolor=0x00000088:boxborderw=16[v1]`,
      `[v1]drawtext=fontfile=/usr/share/fonts/dejavu/DejaVuSans.ttf:text='${brandLine}':fontcolor=0xcccccc:fontsize=28:x=(w-text_w)/2:y=h-100[vout]`,
    ];
    let filterComplex = filters.join(';');
    let inputs = ['-f', 'lavfi', '-i', `color=c=0x1a1033:s=1080x1920:d=${duration.toFixed(2)}`];

    if (persona) {
      inputs.push('-loop', '1', '-i', persona);
      filterComplex = `[1:v]scale=420:420[av];[0:v][av]overlay=(W-w)/2:H/2-120[v0];[v0]drawtext=fontfile=/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf:text='${titleLine}':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=120:box=1:boxcolor=0x00000088:boxborderw=16[v1];[v1]drawtext=fontfile=/usr/share/fonts/dejavu/DejaVuSans.ttf:text='${brandLine}':fontcolor=0xcccccc:fontsize=28:x=(w-text_w)/2:y=h-100[vout]`;
    }

    inputs.push('-i', wavPath);
    const subPathEsc = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    filterComplex += `;[vout]subtitles='${subPathEsc}':force_style='FontSize=28,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,Alignment=2,MarginV=180'[vfinal]`;

    await runFfmpeg([
      ...inputs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[vfinal]',
      '-map',
      persona ? '2:a' : '1:a',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-shortest',
      '-y',
      mp4Path,
    ]);

    if (!fs.existsSync(mp4Path)) return null;
    console.log(`[social-video] rendered ${mp4Path} (${duration.toFixed(1)}s)`);
    return mp4Path;
  } catch (err) {
    console.warn('[social-video] render failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export function cleanupSocialVideoFiles(jobId: string): void {
  const base = path.join(WORK_DIR, jobId.replace(/[^\w-]/g, '_'));
  for (const ext of ['.wav', '.srt', '.mp4']) {
    try {
      fs.unlinkSync(`${base}${ext}`);
    } catch {
      /* ignore */
    }
  }
}
