#!/usr/bin/env node
/**
 * Backfill public-voiced-facts.json from Postgres story_history + style-corpus gold.
 * Usage: node backend/scripts/backfill-public-voiced-facts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const dataDir = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(backendRoot, 'data');
const storePath = path.join(dataDir, 'public-voiced-facts.json');
const goldPath = path.join(dataDir, 'style-corpus', 'gold.jsonl');
const seedGoldPath = path.join(backendRoot, 'src', 'data', 'style-corpus-seed.jsonl');

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

async function loadGoldLines() {
  const lines = [];
  for (const p of [goldPath, seedGoldPath]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (t) lines.push(JSON.parse(t));
    }
  }
  return lines.filter((e) => e.status === 'gold' || e.source === 'seed');
}

async function main() {
  const crypto = await import('node:crypto');
  const facts = [];
  const seen = new Set();

  const add = (entry) => {
    const voicedText = (entry.voicedText || entry.script || '').replace(/\s+/g, ' ').trim();
    if (voicedText.length < 20) return;
    const narrator = entry.narrator || entry.storyNarrator || 'radio_host';
    const key = crypto
      .createHash('sha256')
      .update(
        `${voicedText.toLowerCase()}|${trackKey(entry.artist, entry.title)}|${narrator}`,
      )
      .digest('hex')
      .slice(0, 24);
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({
      id: crypto.randomUUID(),
      artist: entry.artist,
      title: entry.title,
      voicedText,
      seedFact: entry.seedFact || entry.seed_fact || undefined,
      narrator,
      lang: entry.lang === 'en' ? 'en' : 'ru',
      source: entry.source || 'history',
      trackKey: trackKey(entry.artist, entry.title),
      firstVoicedAt: entry.firstVoicedAt || entry.played_at || entry.promotedAt || Date.now(),
      publishedOnSite: false,
    });
  };

  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl) {
    const pool = new pg.Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('railway') ? { rejectUnauthorized: false } : undefined,
    });
    try {
      const res = await pool.query(`
        SELECT artist, title, script, voiced_text, seed_fact, story_narrator, played_at
        FROM story_history
        WHERE seed_fact IS NOT NULL
        ORDER BY played_at DESC
        LIMIT 5000
      `);
      for (const row of res.rows) {
        add({
          artist: row.artist,
          title: row.title,
          voicedText: row.voiced_text || row.script,
          seedFact: row.seed_fact,
          narrator: row.story_narrator || 'radio_host',
          source: 'history',
          played_at: Number(row.played_at),
        });
      }
    } finally {
      await pool.end();
    }
  }

  for (const g of await loadGoldLines()) {
    add({
      artist: g.trackKey?.split('|')[0] || 'Unknown',
      title: g.trackKey?.split('|')[1] || 'Track',
      voicedText: g.script,
      seedFact: g.seedFact,
      narrator: g.narrator,
      lang: g.lang,
      source: 'gold',
      promotedAt: g.promotedAt,
    });
  }

  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(
    storePath,
    JSON.stringify({ updatedAt: Date.now(), facts }, null, 2),
    'utf8',
  );
  console.log(`[backfill-public-facts] wrote ${facts.length} facts → ${storePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
