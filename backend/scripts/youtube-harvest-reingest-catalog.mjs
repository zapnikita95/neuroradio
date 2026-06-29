#!/usr/bin/env node
/**
 * Re-ingest YouTube harvest catalog facts that failed bank gates (saved: false).
 * No STT/LLM — reads youtube-harvest-catalog.json only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestHarvestFacts, flushFactBankSync, factFingerprint } from '../dist/services/fact-bank.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.join(ROOT, 'data');
const CATALOG_FILE = path.join(DATA, 'youtube-harvest-catalog.json');

function loadCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) throw new Error(`missing ${CATALOG_FILE}`);
  return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
}

function saveCatalog(catalog) {
  catalog.updatedAt = new Date().toISOString();
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf8');
}

function ingestTitleForFact(f) {
  if (f.scope === 'artist') return '';
  return f.title ?? '';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const catalog = loadCatalog();
  const pending = (catalog.facts ?? []).filter(
    (f) =>
      f.saved !== true &&
      Math.max(f.interest ?? 0, f.bankQuality ?? 0) >= 5 &&
      f.fact?.length >= 35,
  );
  console.log(`[reingest] catalog facts=${catalog.facts?.length ?? 0} pending saved≠true interest≥5: ${pending.length}`);

  const seen = new Set();
  let savedTotal = 0;
  let tried = 0;

  for (const f of pending) {
    const fp = factFingerprint(f.fact);
    if (seen.has(fp)) continue;
    seen.add(fp);
    tried += 1;
    const title = ingestTitleForFact(f);
    if (dryRun) continue;
    const saved = ingestHarvestFacts(f.artist, title, [
      {
        fact: f.fact,
        scope: f.scope ?? 'track',
        source: 'llm',
        harvestSource: f.videoId ? `youtube:${f.videoId}` : 'youtube:reingest',
        llmInterest: f.interest ?? f.bankQuality ?? 7,
      },
    ]);
    if (saved > 0) {
      savedTotal += saved;
      for (const row of catalog.facts) {
        if (factFingerprint(row.fact) === fp) row.saved = true;
      }
      if (tried % 25 === 0) {
        saveCatalog(catalog);
        flushFactBankSync();
      }
    }
  }

  if (!dryRun) {
    saveCatalog(catalog);
    flushFactBankSync();
  }
  console.log(`[reingest] tried=${tried} saved=${savedTotal}${dryRun ? ' (dry-run)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
