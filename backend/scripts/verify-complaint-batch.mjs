#!/usr/bin/env node
/** Batch local seed verify — complaint tracks from 2026-06-20 session */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const verify = resolve(__dirname, 'verify-story-track.mjs');

const TRACKS = [
  ['The Beatles', 'Taxman', '95%|supertax|налог'],
  ['Glass Animals', 'Walla Walla', 'Zaba|murmur|crowd|мурmur'],
  ['Achille Lauro', '16 Marzo', 'italian|pop-punk|итальян'],
  ['Alvaro Soler', 'Déjala Que Baile', 'Barcelona|исpan|испан'],
  ['Johnny Goth', 'Midnight', 'dream-pop|post-punk|reverb'],
  ['Helmut', 'Hunters', 'Geneva|blues|metal|Helmut'],
  ['Call Me Karizma', 'Fire Escape', '.+'],
  ['Blink-182', 'All The Small Things', '.+'],
];

let failed = 0;
for (const [artist, title, mustMatch] of TRACKS) {
  console.log('\n' + '='.repeat(72));
  const r = spawnSync(process.execPath, [verify, '--local-only', '--artist', artist, '--title', title], {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  if (r.status !== 0) {
    failed += 1;
    continue;
  }
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const seedLine =
    out.match(/curated \(prod path\): (.+)/)?.[1] ??
    out.match(/rules pick: (.+)/)?.[1] ??
    '';
  if (mustMatch !== '.+' && seedLine && !new RegExp(mustMatch, 'i').test(seedLine)) {
    console.error(`FAIL: seed missing expected topic (${mustMatch}): ${seedLine.slice(0, 120)}`);
    failed += 1;
  }
}

console.log('\n' + '='.repeat(72));
if (failed) {
  console.error(`BATCH FAIL — ${failed} track(s)`);
  process.exit(1);
}
console.log('BATCH PASS — all tracks');
