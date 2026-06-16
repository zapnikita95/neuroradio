#!/usr/bin/env node
/** npm run seed:status — прогресс bulk-seed без гадания */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const progressPath = join(dir, '../data/bulk-seed-progress.json');
const catalogPath = join(dir, '../src/data/popular-tracks-catalog.json');
const bankPath = join(dir, '../data/facts-bank.json');

if (!existsSync(progressPath)) {
  console.log('Нет bulk-seed-progress.json — парсинг ещё не запускали.');
  process.exit(0);
}

const prog = JSON.parse(readFileSync(progressPath, 'utf8'));
const cat = existsSync(catalogPath)
  ? JSON.parse(readFileSync(catalogPath, 'utf8'))
  : { tracks: [] };
const st = statSync(progressPath);
const mins = Math.round((Date.now() - st.mtimeMs) / 60000);
const done = prog.doneKeys?.length ?? 0;
const total = cat.tracks?.length ?? 0;
const s = prog.stats ?? {};

console.log('=== bulk-seed status ===');
console.log(`checkpoint: ${prog.savedAt ?? st.mtime.toISOString()} (${mins} min ago)`);
console.log(`finished:   ${prog.finishedAt ? 'YES ' + prog.finishedAt : 'NO (stopped or running)'}`);
console.log(`tracks:     ${done} / ${total} (${total ? ((done / total) * 100).toFixed(1) : 0}%)`);
console.log(`facts:      ${s.total ?? 0} / 60000 target`);
console.log(`hot:        ${s.hot ?? 0} / 20000 target`);
console.log(`zeroFacts:  ${s.zeroFacts ?? 0}`);
console.log(`bySource:   ${JSON.stringify(s.bySource ?? {})}`);
if (existsSync(bankPath)) {
  const mb = (statSync(bankPath).size / 1024 / 1024).toFixed(1);
  console.log(`bank file:  ${mb} MB`);
}
if (mins > 30 && !prog.finishedAt) {
  console.log('\n⚠️  Чекпоинт старше 30 мин — процесс, скорее всего, НЕ работает.');
  console.log('   Запуск: powershell -File scripts/run-bulk-seed-detached.ps1');
}
