#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isListeningStatsFact } from '../dist/services/reference-fact-quality.js';
import { isEligibleHotFact } from '../dist/services/fact-seed-pick.js';

const bankPath = join(dirname(fileURLToPath(import.meta.url)), '../data/facts-bank.json');
if (!existsSync(bankPath)) {
  console.log('No facts-bank.json');
  process.exit(0);
}
const bank = JSON.parse(readFileSync(bankPath, 'utf8'));
let hotLeaks = 0;
let substantiveLeaks = 0;
let metadataOk = 0;

for (const pool of [...Object.values(bank.byTrack ?? {}), ...Object.values(bank.byArtist ?? {})]) {
  for (const f of pool) {
    if (!isListeningStatsFact(f.fact)) continue;
    if (f.isMetadata) metadataOk += 1;
    else substantiveLeaks += 1;
    if (f.isHot) hotLeaks += 1;
    if (
      !f.isMetadata &&
      isEligibleHotFact(f.fact, { metadata: false, artist: f.artist, title: f.title })
    ) {
      substantiveLeaks += 1;
    }
  }
}

console.log('=== Last.fm stats audit ===');
console.log('metadata-only (OK):', metadataOk);
console.log('substantive leaks (BAD):', substantiveLeaks);
console.log('isHot leaks (BAD):', hotLeaks);
process.exit(hotLeaks > 0 || substantiveLeaks > 0 ? 1 : 0);
