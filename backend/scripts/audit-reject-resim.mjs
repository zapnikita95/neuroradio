#!/usr/bin/env node
/**
 * Re-simulate OLD vs NEW reject gates on facts from bank + re-harvest sample.
 * Usage: npm run build && node scripts/audit-reject-resim.mjs [--harvest=80] [--bank-only]
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harvestAllFacts } from '../dist/services/fact-sources/index.js';
import {
  interestScore,
  isBoringFact,
  isMetadataHarvestFact,
} from '../dist/services/reference-fact-quality.js';
import { isParserTrustedHarvestSource } from '../dist/services/fact-sources/types.js';
import { isRejectedPickSeed } from '../dist/services/fact-seed-pick.js';
import { rejectSeedForTrackStory } from '../dist/services/fact-track-anchor.js';
import { isArtistBackstoryNarrative } from '../dist/services/web-snippet-accept.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const BANK = join(__dir, '../data/facts-bank.json');
const PROGRESS = join(__dir, '../data/bulk-seed-progress.json');
const CATALOG = join(__dir, '../src/data/popular-tracks-catalog.json');

const args = process.argv.slice(2);
const harvestN = parseInt(args.find((a) => a.startsWith('--harvest='))?.split('=')[1] ?? '80', 10);
const bankOnly = args.includes('--bank-only');

function isSongMeaningNarrative(trimmed) {
  return (
    isArtistBackstoryNarrative(trimmed) ||
    (/\b(?:95\s*%|supertax|tax rate|one for you|income tax)\b/i.test(trimmed) &&
      /\b(?:wrote|written|harrison|beatles|taxman|song|protest)\b/i.test(trimmed))
  );
}

function oldBulkReject(trimmed, source = 'web', scope = 'track') {
  if (trimmed.length < 35) return 'short';
  if (isBoringFact(trimmed)) return 'boring';
  if (!isParserTrustedHarvestSource(source) && interestScore(trimmed) < 3) return 'score<3';
  return null;
}

function newBulkReject(trimmed, source = 'web', scope = 'track') {
  if (trimmed.length < 35) return 'short';
  if (scope === 'artist' && source === 'wiki' && trimmed.length >= 80) {
    return interestScore(trimmed) < 2 ? 'wiki_low_score' : null;
  }
  if (isBoringFact(trimmed) && !isSongMeaningNarrative(trimmed)) return 'boring';
  if (!isParserTrustedHarvestSource(source) && interestScore(trimmed) < 3) return 'score<3';
  return null;
}

function pickReject(fact, artist, title, trackPool = []) {
  return isRejectedPickSeed(fact, title, 'ru', trackPool, artist, 'artist');
}

function anchorReject(fact, artist, title, trackPool = []) {
  return rejectSeedForTrackStory(fact, artist, title, { trackPoolFacts: trackPool });
}

function classifyFact(entry, artist, title, trackPool) {
  const trimmed = entry.fact?.trim() ?? '';
  if (!trimmed || trimmed.length < 35) return null;
  if (entry.isMetadata || isMetadataHarvestFact(trimmed)) return null;
  const source = entry.harvestSource ?? entry.source ?? 'web';
  const scope = entry.scope ?? 'track';
  const oldB = oldBulkReject(trimmed, source, scope);
  const newB = newBulkReject(trimmed, source, scope);
  const pick = pickReject(trimmed, artist, title, trackPool);
  const anchor = anchorReject(trimmed, artist, title, trackPool);
  const score = interestScore(trimmed);
  const narrative = isSongMeaningNarrative(trimmed);
  return { trimmed, source, scope, score, narrative, oldB, newB, pick, anchor, isHot: entry.isHot };
}

function auditBank() {
  if (!existsSync(BANK)) {
    console.log('No facts-bank.json — skip bank audit');
    return { rescued: [], regressed: [], hotDemoted: [] };
  }
  const bank = JSON.parse(readFileSync(BANK, 'utf8'));
  const rescued = [];
  const regressed = [];
  const hotDemoted = [];
  const stillCut = [];

  for (const [key, pool] of Object.entries(bank.byTrack ?? {})) {
    const [artist, ...tp] = key.split('|');
    const title = tp.join('|');
    const trackPool = pool.map((f) => f.fact);
    for (const entry of pool) {
      const c = classifyFact(entry, artist, title, trackPool);
      if (!c) continue;
      const oldBlocked = c.oldB || c.pick || c.anchor;
      const newBlocked = c.newB || c.pick || c.anchor;
      if (oldBlocked && !newBlocked) {
        rescued.push({ ...c, artist, title, oldBlocked, newBlocked: null });
      }
      if (!oldBlocked && newBlocked) {
        regressed.push({ ...c, artist, title, oldBlocked: null, newBlocked });
      }
      if (c.oldB === 'boring' && c.newB === null && c.score >= 6) {
        rescued.push({ ...c, artist, title, note: 'boring→pass high score' });
      }
      if (c.newB === 'boring' && c.oldB !== 'boring' && c.score >= 8) {
        regressed.push({ ...c, artist, title, note: 'new boring high score' });
      }
      if (c.newB === 'boring' && c.score >= 5 && !c.narrative) {
        stillCut.push({ ...c, artist, title });
      }
      if (entry.isHot === false && c.score >= 8 && !newBlocked && c.narrative) {
        hotDemoted.push({ ...c, artist, title });
      }
    }
  }
  for (const [artist, pool] of Object.entries(bank.byArtist ?? {})) {
    for (const entry of pool) {
      const c = classifyFact(entry, artist, '', []);
      if (!c) continue;
      if (c.oldB && !c.newB) rescued.push({ ...c, artist, title: '' });
      if (!c.oldB && c.newB) regressed.push({ ...c, artist, title: '' });
    }
  }
  return { rescued, regressed, hotDemoted, stillCut };
}

function pickHarvestTracks(n) {
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const prog = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : {};
  const zero = new Set(prog.zeroFactKeys ?? []);
  const done = new Set(prog.doneKeys ?? []);
  const tracks = catalog.tracks ?? [];
  const zeroTracks = tracks.filter((t) => zero.has(`${t.artist.trim().toLowerCase()}|${t.title.trim().toLowerCase()}`));
  const pending = tracks.filter((t) => !done.has(`${t.artist.trim().toLowerCase()}|${t.title.trim().toLowerCase()}`));
  const pick = [];
  const seen = new Set();
  const add = (t) => {
    const k = `${t.artist}|${t.title}`;
    if (seen.has(k)) return;
    seen.add(k);
    pick.push(t);
  };
  for (const t of zeroTracks.slice(0, Math.floor(n / 3))) add(t);
  for (const t of pending.filter((x) => (x.source ?? '').includes('genre-top')).slice(0, Math.floor(n / 3))) add(t);
  for (const t of tracks) {
    if (pick.length >= n) break;
    if (Math.random() < 0.002) add(t);
  }
  return pick.slice(0, n);
}

async function auditHarvest(tracks) {
  const rescued = [];
  const regressed = [];
  const rejected = [];
  let harvested = 0;

  for (const t of tracks) {
    try {
      const facts = await harvestAllFacts({
        artist: t.artist,
        title: t.title,
        countryCode: /[\u0400-\u04FF]/.test(t.artist + t.title) ? 'RU' : undefined,
      });
      harvested += facts.length;
      const trackPool = facts.filter((f) => f.scope !== 'artist').map((f) => f.fact);
      for (const item of facts) {
        const trimmed = item.fact?.trim() ?? '';
        if (trimmed.length < 35 || isMetadataHarvestFact(trimmed)) continue;
        const oldB = oldBulkReject(trimmed, item.source, item.scope);
        const newB = newBulkReject(trimmed, item.source, item.scope);
        const pick = pickReject(trimmed, t.artist, t.title, trackPool);
        const anchor = anchorReject(trimmed, t.artist, t.title, trackPool);
        const row = {
          artist: t.artist,
          title: t.title,
          score: interestScore(trimmed),
          narrative: isSongMeaningNarrative(trimmed),
          source: item.source,
          fact: trimmed.slice(0, 220),
          oldB,
          newB,
          pick,
          anchor,
        };
        if (oldB && !newB) rescued.push(row);
        else if (!oldB && newB) regressed.push(row);
        else if (newB || pick || anchor) rejected.push(row);
      }
    } catch (e) {
      console.warn(`harvest fail ${t.artist} — ${t.title}:`, e.message);
    }
  }
  return { rescued, regressed, rejected, harvested, tracks: tracks.length };
}

function printSamples(label, rows, limit = 15) {
  console.log(`\n=== ${label} (${rows.length}) ===`);
  for (const r of rows.slice(0, limit)) {
    const flags = [
      r.oldB && `old:${r.oldB}`,
      r.newB && `new:${r.newB}`,
      r.pick && 'pick',
      r.anchor && 'anchor',
      r.narrative && 'narrative',
      `score=${r.score}`,
    ]
      .filter(Boolean)
      .join(' ');
    console.log(`\n${r.artist}${r.title ? ` — ${r.title}` : ''} [${flags}]`);
    console.log(`  ${(r.trimmed ?? r.fact ?? '').slice(0, 240)}`);
  }
  if (rows.length > limit) console.log(`\n  … +${rows.length - limit} more`);
}

console.log('=== REJECT RE-SIMULATION (old vs new gates) ===\n');

const bankAudit = auditBank();
const boringRescued = bankAudit.rescued.filter((r) => r.oldB === 'boring' && !r.newB);
const uniqueRegressed = bankAudit.regressed.filter((r) => r.score >= 6);

console.log('--- BANK (local facts-bank.json) ---');
console.log(`Total rescued (old blocked → new pass): ${bankAudit.rescued.length}`);
console.log(`  of those boring→pass: ${boringRescued.length}`);
console.log(`Regressed (new blocks, old passed): ${bankAudit.regressed.length}`);
console.log(`  high-score regressions (≥6): ${uniqueRegressed.length}`);
console.log(`High-score not hot but narrative+pass: ${bankAudit.hotDemoted.length}`);
console.log(`Still cut as boring (score≥5, not narrative): ${bankAudit.stillCut.length}`);

printSamples('BANK: rescued boring→pass (sample)', boringRescued.sort((a, b) => b.score - a.score), 20);
printSamples('BANK: possible regressions score≥6', uniqueRegressed.sort((a, b) => b.score - a.score), 15);
printSamples('BANK: high score narrative but not hot', bankAudit.hotDemoted.sort((a, b) => b.score - a.score), 10);

if (!bankOnly) {
  const tracks = pickHarvestTracks(harvestN);
  console.log(`\n--- RE-HARVEST (${tracks.length} tracks) ---`);
  const h = await auditHarvest(tracks);
  console.log(`Harvested ${h.harvested} raw facts from ${h.tracks} tracks`);
  console.log(`Rescued on harvest: ${h.rescued.length}`);
  console.log(`Regressed on harvest: ${h.regressed.length}`);
  console.log(`Still rejected (new gate): ${h.rejected.length}`);
  printSamples('HARVEST: rescued', h.rescued.sort((a, b) => b.score - a.score), 15);
  printSamples('HARVEST: regressed score≥5', h.regressed.filter((r) => r.score >= 5), 15);
  printSamples(
    'HARVEST: still rejected but score≥8 (check if wrongly cut)',
    h.rejected.filter((r) => r.score >= 8).sort((a, b) => b.score - a.score),
    20,
  );
}

console.log('\n=== SUMMARY ===');
if (uniqueRegressed.length === 0 && boringRescued.length > 0) {
  console.log('New logic mostly FIXES false boring cuts; no high-score regressions in bank.');
} else if (uniqueRegressed.length > 0) {
  console.log('WARNING: some high-score facts newly blocked — review regressions above.');
} else {
  console.log('Few boring rescues in bank — cuts may be from harvest never saving, not gate change.');
}
