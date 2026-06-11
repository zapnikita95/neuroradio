import type { StyleCorpusEntry, StyleQuery } from './style-corpus.js';
import {
  decadeBucket,
  genreBucket,
  loadGoldCorpus,
  STYLE_RAG_MIN_GOLD,
} from './style-corpus.js';
import { resolveStoryNarrator } from './story-narrator.js';

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  for (const [key, va] of a) {
    const vb = b.get(key);
    if (vb) dot += va * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildQueryText(query: StyleQuery): string {
  const narrator = resolveStoryNarrator(query.narratorId);
  const parts = [
    narrator,
    query.lang,
    genreBucket(query.genre),
    decadeBucket(query.year),
    query.seedFact ?? '',
  ];
  return parts.filter(Boolean).join(' ');
}

function buildEntryText(entry: StyleCorpusEntry): string {
  return [entry.narrator, entry.lang, entry.genreBucket, entry.decade, entry.seedFact, entry.script].join(
    ' ',
  );
}

/** Cosine TF retrieval — call only when gold corpus >= STYLE_RAG_MIN_GOLD. */
export function retrieveStyleExamples(query: StyleQuery, limit = 2): StyleCorpusEntry[] {
  const narrator = resolveStoryNarrator(query.narratorId);
  if (narrator === 'auto') return [];

  const pool = loadGoldCorpus().filter((e) => e.narrator === narrator && e.lang === query.lang);
  if (pool.length === 0) return [];

  const queryTf = termFrequency(tokenize(buildQueryText(query)));

  const scored = pool.map((entry) => {
    let score = cosineSimilarity(queryTf, termFrequency(tokenize(buildEntryText(entry))));
    if (entry.genreBucket === genreBucket(query.genre)) score += 0.15;
    if (entry.decade === decadeBucket(query.year)) score += 0.1;
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

export function isStyleRagEnabled(): boolean {
  return loadGoldCorpus().length >= STYLE_RAG_MIN_GOLD;
}
