import { mkdtemp, readFile, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

async function ffmpegOk(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version'], { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

async function runFfmpeg(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

/** Normalize input to 48kHz mono wav. */
export async function normalizeToWav48k(inputPath: string, outputPath: string): Promise<boolean> {
  return runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-ar',
    '48000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    outputPath,
  ]);
}

/** Concatenate wav segments into one file. */
export async function concatWavFiles(segmentPaths: string[], outputPath: string): Promise<boolean> {
  if (segmentPaths.length === 0) return false;
  if (segmentPaths.length === 1) {
    const data = await readFile(segmentPaths[0]!);
    await writeFile(outputPath, data);
    return true;
  }

  const dir = path.dirname(outputPath);
  const listPath = path.join(dir, `concat-${Date.now()}.txt`);
  const lines = segmentPaths.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listPath, lines, 'utf8');

  const ok = await runFfmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    outputPath,
  ]);

  await unlink(listPath).catch(() => undefined);
  return ok;
}

export async function concatAudioBuffersToWav(
  buffers: Buffer[],
  outputPath: string,
): Promise<boolean> {
  if (buffers.length === 0) return false;
  if (buffers.length === 1 && buffers[0]!.slice(0, 4).toString('ascii') === 'RIFF') {
    await writeFile(outputPath, buffers[0]!);
    return true;
  }

  if (!(await ffmpegOk())) {
    console.warn('[audio-concat] ffmpeg missing — using first segment only');
    if (buffers[0]) {
      await writeFile(outputPath, buffers[0]!);
      return true;
    }
    return false;
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-mix-'));
  const wavPaths: string[] = [];
  try {
    for (let i = 0; i < buffers.length; i += 1) {
      const buf = buffers[i]!;
      const isWav = buf.slice(0, 4).toString('ascii') === 'RIFF';
      const wav = path.join(dir, `seg-${i}.wav`);
      if (isWav) {
        await writeFile(wav, buf);
      } else {
        const mp3 = path.join(dir, `seg-${i}.mp3`);
        await writeFile(mp3, buf);
        if (!(await normalizeToWav48k(mp3, wav))) return false;
      }
      wavPaths.push(wav);
    }
    return concatWavFiles(wavPaths, outputPath);
  } finally {
    // temp dir left for OS cleanup
  }
}
