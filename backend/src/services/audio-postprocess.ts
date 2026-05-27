import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export function isAudioPostprocessEnabled(): boolean {
  const flag = process.env.TTS_AUDIO_POSTPROCESS?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  return flag === 'true' || flag === '1' || flag === 'on' || process.env.NODE_ENV === 'production';
}

async function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

/**
 * Loudness-normalize OGG with light EQ/de-esser for warmer, less robotic output.
 * Returns true if file was rewritten.
 */
export async function postprocessOggFile(filePath: string): Promise<boolean> {
  if (!isAudioPostprocessEnabled()) return false;

  const available = await ffmpegAvailable();
  if (!available) {
    console.warn('[audio-postprocess] ffmpeg not found — skipping');
    return false;
  }

  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.post_${path.basename(filePath)}`);

  const filter = [
    'highpass=f=80',
    'lowpass=f=12000',
    'afftdn=nr=8:nf=-25',
    'deesser=i=0.25',
    'acompressor=threshold=-20dB:ratio=2.5:attack=8:release=80',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ].join(',');

  const ok = await new Promise<boolean>((resolve) => {
    const args = [
      '-y',
      '-i',
      filePath,
      '-af',
      filter,
      '-c:a',
      'libopus',
      '-b:a',
      '64k',
      tempPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });

  if (!ok) {
    await fs.unlink(tempPath).catch(() => undefined);
    console.warn(`[audio-postprocess] failed for ${path.basename(filePath)}`);
    return false;
  }

  await fs.rename(tempPath, filePath);
  console.log(`[audio-postprocess] ok ${path.basename(filePath)}`);
  return true;
}
