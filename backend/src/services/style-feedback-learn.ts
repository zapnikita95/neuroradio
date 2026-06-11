import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { trackKey } from './fact-bank.js';
import type { StoryLanguageId } from './story-language.js';
import { resolveStoryNarrator, type StoryNarratorId } from './story-narrator.js';
import { anchorsReferenceFact, validateStoryScript } from './story-quality.js';
import { DEFAULT_STORY_LENGTH } from './story-length.js';
import {
  appendGoldEntry,
  demoteGoldEntry,
  enforceNarratorCap,
  isTooSimilarToCorpus,
  loadGoldCorpus,
  resolveStyleNarrator,
  scriptFingerprint,
  decadeBucket,
  genreBucket,
  STYLE_PROMOTE_MIN_LIKES,
  STYLE_PROMOTE_MIN_TRACKS,
  type StyleCorpusEntry,
  type StyleNarratorId,
} from './style-corpus.js';
import type { StoryFeedbackEntry } from './story-feedback.js';
import { getAccountByInstallId } from './account-store.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const PROMOTE_STATE_PATH = path.join(DATA_DIR, 'style-corpus', 'promote-state.json');

export function inferNarratorForInstall(installId: string): StyleNarratorId | undefined {
  const account = getAccountByInstallId(installId);
  const raw = account?.settings?.storyNarrator?.trim();
  if (!raw) return undefined;
  const id = resolveStoryNarrator(raw);
  return id === 'auto' ? undefined : id;
}

interface PromoteBucket {
  scriptHash: string;
  narrator: StyleNarratorId;
  lang: StoryLanguageId;
  script: string;
  seedFact: string;
  genre?: string;
  year?: number;
  likeCount: number;
  dislikeCount: number;
  trackKeys: Set<string>;
  lastAt: number;
}

interface PromoteStateFile {
  buckets: Record<string, PromoteBucketSerialized>;
}

interface PromoteBucketSerialized {
  scriptHash: string;
  narrator: StyleNarratorId;
  lang: StoryLanguageId;
  script: string;
  seedFact: string;
  genre?: string;
  year?: number;
  likeCount: number;
  dislikeCount: number;
  trackKeys: string[];
  lastAt: number;
}

function bucketKey(scriptHash: string, narrator: StyleNarratorId): string {
  return `${narrator}:${scriptHash}`;
}

function serializeBucket(b: PromoteBucket): PromoteBucketSerialized {
  return {
    ...b,
    trackKeys: [...b.trackKeys],
  };
}

function deserializeBucket(b: PromoteBucketSerialized): PromoteBucket {
  return {
    ...b,
    trackKeys: new Set(b.trackKeys),
  };
}

function loadPromoteState(): Map<string, PromoteBucket> {
  const map = new Map<string, PromoteBucket>();
  if (!fs.existsSync(PROMOTE_STATE_PATH)) return map;
  try {
    const raw = JSON.parse(fs.readFileSync(PROMOTE_STATE_PATH, 'utf8')) as PromoteStateFile;
    for (const [key, val] of Object.entries(raw.buckets ?? {})) {
      map.set(key, deserializeBucket(val));
    }
  } catch (err) {
    console.warn('[style-learn] promote state read failed:', err instanceof Error ? err.message : err);
  }
  return map;
}

function savePromoteState(buckets: Map<string, PromoteBucket>): void {
  fs.mkdirSync(path.dirname(PROMOTE_STATE_PATH), { recursive: true });
  const out: PromoteStateFile = { buckets: {} };
  for (const [key, bucket] of buckets) {
    out.buckets[key] = serializeBucket(bucket);
  }
  fs.writeFileSync(PROMOTE_STATE_PATH, JSON.stringify(out), 'utf8');
}

function passesPromoteQuality(
  script: string,
  seedFact: string,
  artist: string,
  title: string,
  lang: StoryLanguageId,
): boolean {
  if (!script.trim()) return false;

  if (seedFact.trim()) {
    if (!anchorsReferenceFact(script, [seedFact])) return false;
    const check = validateStoryScript(script, DEFAULT_STORY_LENGTH, artist, title, {
      referenceFacts: [seedFact],
      storyLanguage: lang,
      skipPersonaCliches: true,
    });
    return check.ok;
  }

  // Style-only gold (no seed in feedback) — still block obvious garbage.
  const styleOnly = validateStoryScript(script, DEFAULT_STORY_LENGTH, artist, title, {
    referenceFacts: ['style-like placeholder anchor'],
    storyLanguage: lang,
    skipReferenceAnchor: true,
    skipFirstSentenceAnchor: true,
    skipPersonaCliches: true,
  });
  return styleOnly.ok;
}

function tryPromoteBucket(bucket: PromoteBucket, artist: string, title: string): void {
  if (bucket.likeCount < STYLE_PROMOTE_MIN_LIKES) return;
  if (bucket.trackKeys.size < STYLE_PROMOTE_MIN_TRACKS) return;

  const existing = loadGoldCorpus().find(
    (e) => e.status === 'gold' && scriptFingerprint(e.script) === bucket.scriptHash,
  );
  if (existing) return;

  if (isTooSimilarToCorpus(bucket.script, bucket.narrator)) {
    console.log(`[style-learn] skip promote: too similar narrator=${bucket.narrator}`);
    return;
  }

  if (!passesPromoteQuality(bucket.script, bucket.seedFact, artist, title, bucket.lang)) {
    console.log(`[style-learn] skip promote: quality gate narrator=${bucket.narrator}`);
    return;
  }

  const entry: StyleCorpusEntry = {
    id: crypto.randomUUID(),
    narrator: bucket.narrator,
    lang: bucket.lang,
    genreBucket: genreBucket(bucket.genre),
    decade: decadeBucket(bucket.year),
    seedFact: bucket.seedFact,
    script: bucket.script,
    status: 'gold',
    source: 'promoted',
    likeCount: bucket.likeCount,
    promotedAt: Date.now(),
  };

  appendGoldEntry(entry);
  enforceNarratorCap(bucket.narrator);
  console.log(
    `[style-learn] promoted gold id=${entry.id} narrator=${entry.narrator} likes=${bucket.likeCount} tracks=${bucket.trackKeys.size}`,
  );
}

export interface StyleFeedbackContext {
  storyNarrator?: StoryNarratorId;
  seedFact?: string;
  genre?: string;
  year?: number;
  lang?: StoryLanguageId;
}

export function processFeedbackForStyleLearning(
  entry: StoryFeedbackEntry,
  ctx: StyleFeedbackContext = {},
): void {
  const narrator =
    resolveStyleNarrator(ctx.storyNarrator) ?? inferNarratorForInstall(entry.installId);
  const script = entry.script?.trim();
  if (!narrator || !script) return;

  const hash = scriptFingerprint(script);
  const key = bucketKey(hash, narrator);
  const buckets = loadPromoteState();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = {
      scriptHash: hash,
      narrator,
      lang: ctx.lang ?? 'ru',
      script,
      seedFact: ctx.seedFact?.trim() ?? '',
      genre: ctx.genre,
      year: ctx.year,
      likeCount: 0,
      dislikeCount: 0,
      trackKeys: new Set(),
      lastAt: entry.at,
    };
    buckets.set(key, bucket);
  }

  const tk = trackKey(entry.artist, entry.title);
  bucket.lastAt = entry.at;

  if (entry.vote === 'like' && entry.reason === 'good_persona') {
    bucket.likeCount += 1;
    bucket.trackKeys.add(tk);
    if (ctx.seedFact?.trim() && !bucket.seedFact) bucket.seedFact = ctx.seedFact.trim();
    tryPromoteBucket(bucket, entry.artist, entry.title);
  }

  if (entry.vote === 'dislike' && entry.reason === 'speech_manner') {
    bucket.dislikeCount += 1;
    if (bucket.dislikeCount >= 3) {
      const goldHit = loadGoldCorpus().find(
        (e) =>
          e.source === 'promoted' &&
          scriptFingerprint(e.script) === hash &&
          e.narrator === narrator,
      );
      if (goldHit) {
        demoteGoldEntry(goldHit.id);
        console.log(`[style-learn] demoted id=${goldHit.id} narrator=${narrator}`);
      }
    }
  }

  savePromoteState(buckets);
}
