#!/usr/bin/env node
/** Remove doneKeys for genre-top tracks that still have zero facts — queue for bulk re-harvest. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PROGRESS = join(__dir, '../data/bulk-seed-progress.json');
const CATALOG = join(__dir, '../src/data/popular-tracks-catalog.json');

function trackKey(a, t) {
  return `${a.trim().toLowerCase()}|${t.trim().toLowerCase()}`;
}

const prog = JSON.parse(readFileSync(PROGRESS, 'utf8'));
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const zeroKeys = new Set(prog.zeroFactKeys ?? []);
const doneKeys = new Set(prog.doneKeys ?? []);
const catMap = new Map((catalog.tracks ?? []).map((t) => [trackKey(t.artist, t.title), t]));

let cleared = 0;
for (const key of zeroKeys) {
  const t = catMap.get(key);
  if (!t) continue;
  if (!(t.source ?? '').startsWith('genre-top')) continue;
  if (/[\u0400-\u04FF]/.test(t.artist + t.title)) continue;
  if (doneKeys.delete(key)) cleared += 1;
}

prog.doneKeys = [...doneKeys];
prog.finishedAt = undefined;
writeFileSync(PROGRESS, JSON.stringify(prog, null, 2));
console.log(`Cleared ${cleared} genre-top EN zero tracks from doneKeys — bulk will re-harvest on resume.`);
