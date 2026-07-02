#!/usr/bin/env node
/**
 * Backfill public-voiced-facts.json from:
 * - Postgres triple-like feedback + story_history (voiced_text preferred)
 * - style-corpus gold (seed + runtime)
 *
 * Only quality-approved content — NOT all completed stories.
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
const feedbackJsonl = path.join(dataDir, 'story-feedback.jsonl');

const TRIPLE = ['interesting_fact', 'good_speech', 'good_persona'];

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

function goldTrackFromEntry(g) {
  const id = String(g.id ?? '').toLowerCase();
  const fact = String(g.seedFact ?? '').toLowerCase();
  if (id.includes('thriller') || fact.includes('thriller')) return ['Michael Jackson', 'Thriller'];
  if (id.includes('bohemian') || id.includes('queen') || fact.includes('bohemian rhapsody'))
    return ['Queen', 'Bohemian Rhapsody'];
  if (id.includes('smells') || id.includes('teen-spirit') || fact.includes('teen spirit'))
    return ['Nirvana', 'Smells Like Teen Spirit'];
  if (id.includes('blinding') || fact.includes('blinding lights'))
    return ['The Weeknd', 'Blinding Lights'];
  if (id.includes('tsoi') || id.includes('krovi') || fact.includes('gruppa krovi'))
    return ['Kino', 'Gruppa krovi'];
  if (id.includes('techno') || id.includes('daft') || fact.includes('daft punk'))
    return ['Daft Punk', 'Around the World'];
  if (id.includes('jazz') || id.includes('miles') || fact.includes('kind of blue'))
    return ['Miles Davis', 'Kind of Blue'];
  if (g.trackKey?.includes('|')) {
    const [a, t] = g.trackKey.split('|');
    return [a, t];
  }
  return null;
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

function loadTripleLikeFromJsonl() {
  if (!fs.existsSync(feedbackJsonl)) return [];
  const groups = new Map();
  for (const line of fs.readFileSync(feedbackJsonl, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let row;
    try {
      row = JSON.parse(t);
    } catch {
      continue;
    }
    if (row.vote !== 'like' || !TRIPLE.includes(row.reason)) continue;
    const key = `${row.installId}|${row.artist}|${row.title}|${row.script ?? ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        artist: row.artist,
        title: row.title,
        script: row.script,
        seedFact: row.seedFact,
        storyNarrator: row.storyNarrator,
        lang: row.lang,
        reasons: new Set(),
        at: row.at ?? Date.now(),
      });
    }
    const g = groups.get(key);
    g.reasons.add(row.reason);
    if (row.seedFact && !g.seedFact) g.seedFact = row.seedFact;
    if (row.storyNarrator && !g.storyNarrator) g.storyNarrator = row.storyNarrator;
  }
  return [...groups.values()].filter((g) => TRIPLE.every((r) => g.reasons.has(r)));
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
      .update(`${voicedText.toLowerCase()}|${trackKey(entry.artist, entry.title)}|${narrator}`)
      .digest('hex')
      .slice(0, 24);
    if (seen.has(key)) return;
    seen.add(key);
    facts.push({
      id: crypto.randomUUID(),
      artist: entry.artist,
      title: entry.title,
      voicedText,
      seedFact: entry.seedFact || undefined,
      narrator,
      lang: entry.lang === 'en' ? 'en' : 'ru',
      source: entry.source === 'gold' ? 'gold' : 'history',
      trackKey: trackKey(entry.artist, entry.title),
      firstVoicedAt: entry.firstVoicedAt || entry.played_at || entry.at || Date.now(),
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
      const tripleRes = await pool.query(`
        SELECT install_id, artist, title, script
        FROM story_feedback
        WHERE vote = 'like' AND reason = ANY($1::text[])
        GROUP BY install_id, artist, title, script
        HAVING COUNT(DISTINCT reason) = 3
      `, [TRIPLE]);

      for (const row of tripleRes.rows) {
        const hist = await pool.query(
          `SELECT voiced_text, script, seed_fact, story_narrator, played_at
           FROM story_history
           WHERE artist = $1 AND title = $2 AND (script = $3 OR voiced_text = $3)
           ORDER BY played_at DESC LIMIT 1`,
          [row.artist, row.title, row.script],
        );
        const h = hist.rows[0];
        add({
          artist: row.artist,
          title: row.title,
          voicedText: h?.voiced_text || h?.script || row.script,
          seedFact: h?.seed_fact,
          narrator: h?.story_narrator || 'radio_host',
          source: 'history',
          played_at: h?.played_at ? Number(h.played_at) : Date.now(),
        });
      }
    } finally {
      await pool.end();
    }
  } else {
    for (const g of loadTripleLikeFromJsonl()) {
      add({
        artist: g.artist,
        title: g.title,
        voicedText: g.script,
        seedFact: g.seedFact,
        narrator: g.storyNarrator || 'radio_host',
        lang: g.lang,
        source: 'history',
        at: g.at,
      });
    }
  }

  for (const g of await loadGoldLines()) {
    const track = goldTrackFromEntry(g);
    if (!track) continue;
    add({
      artist: track[0],
      title: track[1],
      voicedText: g.script,
      seedFact: g.seedFact,
      narrator: g.narrator,
      lang: g.lang,
      source: 'gold',
      firstVoicedAt: g.promotedAt ?? Date.now(),
    });
  }

  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({ updatedAt: Date.now(), facts }, null, 2), 'utf8');
  console.log(`[backfill-public-facts] wrote ${facts.length} facts → ${storePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
