import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getPool, hasPostgres } from './db.js';

export interface FactMissEntry {
  id: string;
  artist: string;
  title: string;
  installId: string;
  reason: 'no_reference_facts' | 'indie_no_artist_fact' | 'relevance_filter_empty' | 'cover_ambiguous';
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

async function recentMissInPostgres(entry: Omit<FactMissEntry, 'id' | 'at'>): Promise<boolean> {
  if (!hasPostgres()) return false;
  const since = Date.now() - 6 * 60 * 60 * 1000;
  const res = await getPool().query(
    `SELECT 1 FROM fact_misses
     WHERE LOWER(artist) = LOWER($1) AND LOWER(title) = LOWER($2)
       AND reason = $3 AND created_at > $4 LIMIT 1`,
    [entry.artist, entry.title, entry.reason, since],
  );
  return (res.rowCount ?? 0) > 0;
}

export function recordFactMiss(entry: Omit<FactMissEntry, 'id' | 'at'>): void {
  const record: FactMissEntry = {
    ...entry,
    id: crypto.randomUUID(),
    at: Date.now(),
  };

  const persist = async () => {
    if (hasPostgres()) {
      if (await recentMissInPostgres(entry)) return;
      await getPool().query(
        `INSERT INTO fact_misses (id, install_id, artist, title, reason, artist_tier, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          record.id,
          record.installId,
          record.artist,
          record.title,
          record.reason,
          record.artistTier ?? null,
          record.at,
        ],
      );
      console.log(
        `[fact-miss] reason=${entry.reason} artist="${entry.artist}" title="${entry.title}" store=postgres`,
      );
      return;
    }

    const misses = loadMisses();
    const fp = `${entry.artist}|${entry.title}|${entry.reason}`.toLowerCase();
    const recent = misses.find(
      (m) =>
        `${m.artist}|${m.title}|${m.reason}`.toLowerCase() === fp &&
        Date.now() - m.at < 6 * 60 * 60 * 1000,
    );
    if (recent) return;
    misses.push(record);
    saveMisses(misses);
    console.log(
      `[fact-miss] reason=${entry.reason} artist="${entry.artist}" title="${entry.title}" path=${MISS_PATH}`,
    );
  };

  void persist().catch((err) =>
    console.error('[fact-miss] persist failed:', err instanceof Error ? err.message : err),
  );
}
