#!/usr/bin/env node
/**
 * Batch verify with delay — avoids prod 503/quota hammering.
 * npm run verify:batch
 * npm run verify:batch -- --delay 120000
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const args = process.argv.slice(2);
const delayArg = args.includes('--delay') ? Number(args[args.indexOf('--delay') + 1]) : 90_000;
const fileArg = args.includes('--file')
  ? args[args.indexOf('--file') + 1]
  : 'scripts/user-tracks-batch.txt';
const prodOnly = args.includes('--prod-only');
const localOnly = args.includes('--local-only');

const lines = readFileSync(resolve(root, fileArg), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

let failed = 0;
for (let i = 0; i < lines.length; i++) {
  const [artist, title] = lines[i].split('|').map((s) => s.trim());
  if (!artist || !title) continue;
  console.log(`\n[${i + 1}/${lines.length}] ${artist} — ${title}\n`);
  const extra = [];
  if (prodOnly) extra.push('--prod-only');
  if (localOnly) extra.push('--local-only');
  const r = spawnSync(
    process.execPath,
    [resolve(__dirname, 'verify-story-track.mjs'), '--artist', artist, '--title', title, ...extra],
    { cwd: root, stdio: 'inherit', shell: false },
  );
  if (r.status !== 0) failed += 1;
  if (i < lines.length - 1 && !localOnly) {
    console.log(`\n… pause ${delayArg / 1000}s before next prod request\n`);
    await new Promise((res) => setTimeout(res, delayArg));
  }
}

console.log(`\nBATCH ${failed === 0 ? 'PASS' : 'FAIL'} — ${failed}/${lines.length} failed\n`);
process.exit(failed === 0 ? 0 : 1);
