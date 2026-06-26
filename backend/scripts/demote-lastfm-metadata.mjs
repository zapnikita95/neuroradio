#!/usr/bin/env node
/** One-shot: demote Last.fm playcount lines to metadata-only in facts-bank.json */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isListeningStatsFact, isMetadataHarvestFact } from '../dist/services/reference-fact-quality.js';

const bankPath = join(dirname(fileURLToPath(import.meta.url)), '../data/facts-bank.json');
if (!existsSync(bankPath)) {
  console.log('No bank');
  process.exit(0);
}
const bank = JSON.parse(readFileSync(bankPath, 'utf8'));
let fixed = 0;
for (const pool of [...Object.values(bank.byTrack ?? {}), ...Object.values(bank.byArtist ?? {})]) {
  for (const f of pool) {
    if (!isListeningStatsFact(f.fact) && !isMetadataHarvestFact(f.fact)) continue;
    if (!f.isMetadata || f.isHot) {
      f.isMetadata = true;
      f.isHot = false;
      fixed += 1;
    }
  }
}
if (fixed) writeFileSync(bankPath, JSON.stringify(bank, null, 2));
console.log(`Demoted ${fixed} Last.fm/metadata facts → isMetadata=true, isHot=false`);
