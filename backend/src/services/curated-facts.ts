import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestFacts } from './fact-bank.js';
import type { FactScope } from './fact-picker.js';

interface CuratedFactEntry {
  artist: string;
  title: string;
  scope: FactScope;
  fact: string;
}

const __dir = dirname(fileURLToPath(import.meta.url));

/** Одноразово подмешивает проверенные факты в facts-bank (идемпотентно по fingerprint). */
export function ingestCuratedFactsOnBoot(): number {
  let raw: CuratedFactEntry[];
  try {
    const path = join(__dir, 'data/curated-facts.json');
    raw = JSON.parse(readFileSync(path, 'utf8')) as CuratedFactEntry[];
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of raw) {
    total += ingestFacts(entry.artist, entry.title, [
      { fact: entry.fact, scope: entry.scope, source: 'api' },
    ]);
  }
  if (total > 0) {
    console.log(`[fact-bank] curated facts ingested: ${total} new`);
  }
  return total;
}
