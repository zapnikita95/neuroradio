import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StoryLanguageId } from './story-language.js';
import { resolveStoryNarrator, type StoryNarratorId } from './story-narrator.js';
import { retrieveStyleExamples } from './style-rag.js';

export const STYLE_RAG_MIN_GOLD = parseInt(process.env.STYLE_RAG_MIN_GOLD ?? '50', 10);
export const STYLE_PROMOTE_MIN_LIKES = parseInt(process.env.STYLE_PROMOTE_MIN_LIKES ?? '1', 10);
export const STYLE_PROMOTE_MIN_TRACKS = parseInt(process.env.STYLE_PROMOTE_MIN_TRACKS ?? '1', 10);
export const STYLE_MAX_GOLD_PER_NARRATOR = parseInt(process.env.STYLE_MAX_GOLD_PER_NARRATOR ?? '20', 10);
export const STYLE_FEWSHOT_MAX = 2;

export type StyleCorpusStatus = 'gold' | 'candidate' | 'demoted';
export type StyleCorpusSource = 'seed' | 'promoted' | 'manual';

export type StyleNarratorId = Exclude<StoryNarratorId, 'auto'>;

export interface StyleCorpusEntry {
  id: string;
  narrator: StyleNarratorId;
  lang: StoryLanguageId;
  genreBucket: string;
  decade: string;
  seedFact: string;
  script: string;
  status: StyleCorpusStatus;
  source: StyleCorpusSource;
  trackKey?: string;
  likeCount?: number;
  dislikeCount?: number;
  promotedAt?: number;
}

export interface StyleQuery {
  narratorId: StoryNarratorId;
  lang: StoryLanguageId;
  genre?: string;
  year?: number;
  seedFact?: string;
}

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const CORPUS_DIR = path.join(DATA_DIR, 'style-corpus');
const GOLD_PATH = path.join(CORPUS_DIR, 'gold.jsonl');
const SEED_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/style-corpus-seed.jsonl',
);

let cachedGold: StyleCorpusEntry[] | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 30_000;

export function genreBucket(genre?: string): string {
  if (!genre?.trim()) return 'unknown';
  const g = genre.toLowerCase();
  if (/(?:pop|dance|synth)/.test(g)) return 'pop';
  if (/(?:rock|metal|punk|grunge)/.test(g)) return 'rock';
  if (/(?:hip hop|rap|trap|drill)/.test(g)) return 'hiphop';
  if (/(?:jazz|blues|soul|r&b|funk)/.test(g)) return 'jazz';
  if (/(?:electronic|techno|house|edm|trance)/.test(g)) return 'electronic';
  if (/(?:classical|orchestr)/.test(g)) return 'classical';
  if (/(?:country|folk|americana)/.test(g)) return 'folk';
  return 'other';
}

export function decadeBucket(year?: number): string {
  if (!year || year < 1900) return 'unknown';
  const d = Math.floor(year / 10) * 10;
  return `${d}s`;
}

function normalizeScript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scriptFingerprint(script: string): string {
  return crypto.createHash('sha256').update(normalizeScript(script)).digest('hex').slice(0, 16);
}

function parseLine(line: string): StyleCorpusEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const raw = JSON.parse(trimmed) as StyleCorpusEntry;
    if (!raw.id || !raw.narrator || !raw.script || !raw.seedFact) return null;
    return raw;
  } catch {
    return null;
  }
}

function readJsonl(filePath: string): StyleCorpusEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const out: StyleCorpusEntry[] = [];
  for (const line of lines) {
    const entry = parseLine(line);
    if (entry) out.push(entry);
  }
  return out;
}

function ensureSeedMerged(): void {
  fs.mkdirSync(CORPUS_DIR, { recursive: true });
  const seedEntries = readJsonl(SEED_PATH);
  if (seedEntries.length === 0) return;

  const existing = readJsonl(GOLD_PATH);
  const ids = new Set(existing.map((e) => e.id));
  const toAppend = seedEntries.filter((e) => !ids.has(e.id));
  if (toAppend.length === 0) return;

  const payload = toAppend.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.appendFileSync(GOLD_PATH, payload, 'utf8');
  console.log(`[style-corpus] merged ${toAppend.length} seed entries into gold`);
}

export function loadGoldCorpus(force = false): StyleCorpusEntry[] {
  const now = Date.now();
  if (!force && cachedGold && now - cacheAt < CACHE_TTL_MS) {
    return cachedGold;
  }
  ensureSeedMerged();
  cachedGold = readJsonl(GOLD_PATH).filter((e) => e.status === 'gold');
  cacheAt = now;
  return cachedGold;
}

export function countGoldCorpus(): number {
  return loadGoldCorpus().length;
}

export function invalidateStyleCorpusCache(): void {
  cachedGold = null;
  cacheAt = 0;
}

export function appendGoldEntry(entry: StyleCorpusEntry): void {
  fs.mkdirSync(CORPUS_DIR, { recursive: true });
  fs.appendFileSync(GOLD_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  invalidateStyleCorpusCache();
}

export function demoteGoldEntry(id: string): boolean {
  const all = readJsonl(GOLD_PATH);
  let changed = false;
  const next = all.map((e) => {
    if (e.id !== id) return e;
    changed = true;
    return { ...e, status: 'demoted' as const };
  });
  if (!changed) return false;
  fs.writeFileSync(GOLD_PATH, next.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  invalidateStyleCorpusCache();
  return true;
}

export function enforceNarratorCap(narrator: StyleNarratorId): void {
  const gold = loadGoldCorpus(true).filter((e) => e.narrator === narrator && e.source === 'promoted');
  if (gold.length <= STYLE_MAX_GOLD_PER_NARRATOR) return;

  const sorted = [...gold].sort((a, b) => (a.likeCount ?? 0) - (b.likeCount ?? 0));
  const excess = sorted.slice(0, gold.length - STYLE_MAX_GOLD_PER_NARRATOR);
  for (const e of excess) {
    demoteGoldEntry(e.id);
    console.log(`[style-corpus] cap demote narrator=${narrator} id=${e.id}`);
  }
}

export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeScript(a).split(' ').filter((w) => w.length >= 4));
  const wordsB = new Set(normalizeScript(b).split(' ').filter((w) => w.length >= 4));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let inter = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) inter += 1;
  }
  const union = wordsA.size + wordsB.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function isTooSimilarToCorpus(script: string, narrator: StyleNarratorId, threshold = 0.85): boolean {
  const gold = loadGoldCorpus().filter((e) => e.narrator === narrator);
  return gold.some((e) => jaccardSimilarity(script, e.script) >= threshold);
}

export function pickFewShotExamples(query: StyleQuery, limit = STYLE_FEWSHOT_MAX): StyleCorpusEntry[] {
  const narrator = resolveStoryNarrator(query.narratorId);
  if (narrator === 'auto') return [];

  const gold = loadGoldCorpus().filter((e) => e.narrator === narrator && e.lang === query.lang);
  if (gold.length === 0) return [];

  const targetGenre = genreBucket(query.genre);
  const targetDecade = decadeBucket(query.year);

  const scored = gold.map((entry) => {
    let score = 0;
    if (entry.genreBucket === targetGenre) score += 4;
    if (entry.decade === targetDecade) score += 3;
    if (entry.genreBucket === 'unknown' || entry.decade === 'unknown') score += 1;
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/** Prompt block: few-shot always; RAG when gold >= STYLE_RAG_MIN_GOLD. */
export function buildStylePromptBlock(query: StyleQuery): string | null {
  const narrator = resolveStoryNarrator(query.narratorId);
  if (narrator === 'auto') return null;

  const goldCount = countGoldCorpus();
  const examples =
    goldCount >= STYLE_RAG_MIN_GOLD
      ? retrieveStyleExamples(query, STYLE_FEWSHOT_MAX)
      : pickFewShotExamples(query, STYLE_FEWSHOT_MAX);

  if (examples.length === 0) return null;

  const mode = goldCount >= STYLE_RAG_MIN_GOLD ? 'RAG' : 'few-shot';
  const header =
    query.lang === 'en'
      ? `STYLE EXAMPLES (${mode}, persona "${narrator}" — copy RHYTHM and TONE, NOT facts, NOT verbatim):`
      : `ПРИМЕРЫ ПОДАЧИ (${mode}, амплуа «${narrator}» — копируй РИТМ и ТОН, НЕ факты и НЕ дословно):`;
  const lines: string[] = [header];

  examples.forEach((ex, i) => {
    lines.push(`${i + 1}. [${ex.genreBucket}, ${ex.decade}] ${ex.script}`);
  });

  lines.push(
    query.lang === 'en'
      ? 'Examples are style only. Content MUST come from the fact seed above.'
      : 'Эти примеры — только образец стиля. Содержание бери СТРОГО из СЕМЯ ИСТОРИИ выше.',
  );
  return lines.join('\n');
}

export function resolveStyleNarrator(value: unknown): StyleNarratorId | null {
  const id = resolveStoryNarrator(value);
  if (id === 'auto') return null;
  return id;
}
