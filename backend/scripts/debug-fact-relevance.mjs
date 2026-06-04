#!/usr/bin/env node
/** Debug: why facts fail relevance for one track */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');
function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve(repoRoot, '.env'));
loadEnv(resolve(root, '.env'));

const artist = process.argv[2] ?? 'Molchat Doma';
const title = process.argv[3] ?? 'Sudno';

const { fetchWikiBundleMerged } = await import('../dist/services/fact-aggregator.js');
const { factAppliesToRequest, factNamesForeignEntity, factMentionsArtist, factMentionsTitle } =
  await import('../dist/services/fact-relevance.js');

const wiki = await fetchWikiBundleMerged(artist, title, 'BY');
const all = [...wiki.trackFacts, ...wiki.artistFacts];
console.log(`Wiki raw: track=${wiki.trackFacts.length} artist=${wiki.artistFacts.length}\n`);

for (const fact of all.slice(0, 15)) {
  const trackOk = factAppliesToRequest(fact, artist, title, 'track');
  const artistOk = factAppliesToRequest(fact, artist, title, 'artist');
  const foreign = factNamesForeignEntity(fact, artist, title);
  const mentionsA = factMentionsArtist(fact, artist);
  const mentionsT = factMentionsTitle(fact, title);
  console.log('─'.repeat(60));
  console.log(fact.slice(0, 220));
  console.log(`  track=${trackOk} artist=${artistOk} foreign=${foreign} mentionsArtist=${mentionsA} mentionsTitle=${mentionsT}`);
}
