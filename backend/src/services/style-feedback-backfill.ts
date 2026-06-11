import fs from 'node:fs';
import path from 'node:path';
import { getPool, hasPostgres } from './db.js';
import { resolveStoryNarrator, type StoryNarratorId } from './story-narrator.js';
import type { StoryLanguageId } from './story-language.js';
import {
  countGoldCorpus,
  loadGoldCorpus,
  resolveStyleNarrator,
  scriptFingerprint,
} from './style-corpus.js';
import { isStyleRagEnabled } from './style-rag.js';
import type { StoryFeedbackEntry } from './story-feedback.js';
import {
  processFeedbackForStyleLearning,
  inferNarratorForInstall,
  type StyleFeedbackContext,
} from './style-feedback-learn.js';
const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const FEEDBACK_PATH = path.join(DATA_DIR, 'story-feedback.jsonl');

function normalizeScript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface FeedbackEnrichment {
  storyNarrator?: StoryNarratorId;
  seedFact?: string;
  genre?: string;
  year?: number;
  lang?: StoryLanguageId;
}

async function findSeedInPostgresHistory(
  installId: string,
  artist: string,
  title: string,
  script: string,
): Promise<{ seedFact?: string }> {
  if (!hasPostgres()) return {};
  const normalized = installId.trim().toLowerCase();
  const res = await getPool().query(
    `SELECT seed_fact, script FROM story_history
     WHERE install_id = $1
       AND lower(artist) = lower($2)
       AND lower(title) = lower($3)
     ORDER BY played_at DESC
     LIMIT 12`,
    [normalized, artist.trim(), title.trim()],
  );
  const target = normalizeScript(script);
  for (const row of res.rows) {
    const histScript = typeof row.script === 'string' ? row.script : '';
    if (normalizeScript(histScript) === target || target.startsWith(normalizeScript(histScript).slice(0, 80))) {
      const seed = typeof row.seed_fact === 'string' ? row.seed_fact.trim() : '';
      if (seed) return { seedFact: seed };
    }
  }
  return {};
}

export async function enrichFeedbackContext(  entry: StoryFeedbackEntry,
  overrides: Partial<FeedbackEnrichment> = {},
): Promise<StyleFeedbackContext> {
  const narrator =
    overrides.storyNarrator ??
    resolveStyleNarrator(entry.storyNarrator) ??
    inferNarratorForInstall(entry.installId);

  let seedFact = overrides.seedFact ?? entry.seedFact?.trim();
  if (!seedFact && entry.script?.trim()) {
    const hist = await findSeedInPostgresHistory(
      entry.installId,
      entry.artist,
      entry.title,
      entry.script,
    );
    seedFact = hist.seedFact;
  }

  const lang = (overrides.lang ?? entry.lang === 'en' ? 'en' : 'ru') as StoryLanguageId;

  return {
    storyNarrator: narrator,
    seedFact,
    genre: overrides.genre ?? entry.genre,
    year: overrides.year ?? entry.year,
    lang,
  };
}

export async function loadAllStoryFeedback(limit = 20_000): Promise<StoryFeedbackEntry[]> {
  const out: StoryFeedbackEntry[] = [];
  const seen = new Set<string>();

  if (fs.existsSync(FEEDBACK_PATH)) {
    const lines = fs.readFileSync(FEEDBACK_PATH, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as StoryFeedbackEntry;
        if (row.id && !seen.has(row.id)) {
          seen.add(row.id);
          out.push(row);
        }
      } catch {
        /* skip */
      }
    }
  }

  if (hasPostgres()) {
    const res = await getPool().query(
      `SELECT id, install_id, artist, title, vote, reason, script, created_at
       FROM story_feedback
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );
    for (const row of res.rows) {
      const id = String(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        installId: String(row.install_id),
        artist: String(row.artist),
        title: String(row.title),
        vote: row.vote === 'dislike' ? 'dislike' : 'like',
        reason: String(row.reason),
        script: typeof row.script === 'string' ? row.script : undefined,
        at: Number(row.created_at),
      });
    }
  }

  out.sort((a, b) => b.at - a.at);
  return out;
}

export interface StyleBackfillResult {
  scanned: number;
  goodPersona: number;
  reprocessed: number;
  skippedNoNarrator: number;
  skippedNoScript: number;
  goldBefore: number;
  goldAfter: number;
  ragEnabled: boolean;
  promotedByNarrator: Record<string, number>;
  samplePromoted: Array<{ narrator: string; artist: string; title: string; scriptPreview: string }>;
}

export async function backfillStyleCorpusFromFeedback(): Promise<StyleBackfillResult> {
  const goldBefore = countGoldCorpus();
  const entries = await loadAllStoryFeedback();
  let goodPersona = 0;
  let reprocessed = 0;
  let skippedNoNarrator = 0;
  let skippedNoScript = 0;

  for (const entry of entries) {
    if (entry.vote !== 'like' || entry.reason !== 'good_persona') continue;
    goodPersona += 1;
    if (!entry.script?.trim()) {
      skippedNoScript += 1;
      continue;
    }

    const ctx = await enrichFeedbackContext(entry);
    if (!ctx.storyNarrator) {
      skippedNoNarrator += 1;
      continue;
    }

    processFeedbackForStyleLearning(entry, ctx);
    reprocessed += 1;
  }

  const goldAfter = countGoldCorpus();
  const gold = loadGoldCorpus().filter((e) => e.source === 'promoted');
  const promotedByNarrator: Record<string, number> = {};
  for (const e of gold) {
    promotedByNarrator[e.narrator] = (promotedByNarrator[e.narrator] ?? 0) + 1;
  }

  const samplePromoted = gold.slice(0, 8).map((e) => ({
    narrator: e.narrator,
    artist: '',
    title: '',
    scriptPreview: e.script.length > 120 ? `${e.script.slice(0, 120)}…` : e.script,
  }));

  console.log(
    `[style-backfill] scanned=${entries.length} good_persona=${goodPersona} reprocessed=${reprocessed} gold ${goldBefore}→${goldAfter} rag=${isStyleRagEnabled()}`,
  );

  return {
    scanned: entries.length,
    goodPersona,
    reprocessed,
    skippedNoNarrator,
    skippedNoScript,
    goldBefore,
    goldAfter,
    ragEnabled: isStyleRagEnabled(),
    promotedByNarrator,
    samplePromoted,
  };
}

export async function summarizeGoodPersonaFeedback(): Promise<
  Array<{ narrator: string; count: number; installs: string[] }>
> {
  const entries = await loadAllStoryFeedback();
  const buckets = new Map<string, { count: number; installs: Set<string> }>();

  for (const entry of entries) {
    if (entry.vote !== 'like' || entry.reason !== 'good_persona' || !entry.script?.trim()) continue;
    const ctx = await enrichFeedbackContext(entry);
    const narrator = ctx.storyNarrator ?? 'unknown';
    const b = buckets.get(narrator) ?? { count: 0, installs: new Set<string>() };
    b.count += 1;
    b.installs.add(entry.installId.slice(0, 8));
    buckets.set(narrator, b);
  }

  return [...buckets.entries()]
    .map(([narrator, b]) => ({
      narrator,
      count: b.count,
      installs: [...b.installs],
    }))
    .sort((a, b) => b.count - a.count);
}

export function isScriptAlreadyPromoted(script: string): boolean {
  const hash = scriptFingerprint(script);
  return loadGoldCorpus().some((e) => e.status === 'gold' && scriptFingerprint(e.script) === hash);
}
