import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface FactMissEntry {
  id: string;
  artist: string;
  title: string;
  installId: string;
  reason: 'no_reference_facts' | 'indie_no_artist_fact' | 'relevance_filter_empty';
  artistTier?: string;
  at: number;
}

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const MISS_PATH = path.join(DATA_DIR, 'fact-misses.json');

function loadMisses(): FactMissEntry[] {
  try {
    if (!fs.existsSync(MISS_PATH)) return [];
    return JSON.parse(fs.readFileSync(MISS_PATH, 'utf8')) as FactMissEntry[];
  } catch {
    return [];
  }
}

function saveMisses(entries: FactMissEntry[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MISS_PATH, JSON.stringify(entries.slice(-500), null, 2), 'utf8');
}

export function recordFactMiss(entry: Omit<FactMissEntry, 'id' | 'at'>): void {
  const misses = loadMisses();
  const fp = `${entry.artist}|${entry.title}|${entry.reason}`.toLowerCase();
  const recent = misses.find(
    (m) =>
      `${m.artist}|${m.title}|${m.reason}`.toLowerCase() === fp &&
      Date.now() - m.at < 6 * 60 * 60 * 1000,
  );
  if (recent) return;

  misses.push({
    ...entry,
    id: crypto.randomUUID(),
    at: Date.now(),
  });
  saveMisses(misses);
  console.log(
    `[fact-miss] reason=${entry.reason} artist="${entry.artist}" title="${entry.title}" path=${MISS_PATH}`,
  );
}
