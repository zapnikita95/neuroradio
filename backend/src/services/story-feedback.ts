import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getPool, hasPostgres } from './db.js';
import { processFeedbackForStyleLearning } from './style-feedback-learn.js';
import { enrichFeedbackContext } from './style-feedback-backfill.js';
import type { StoryLanguageId } from './story-language.js';
import { resolveStoryNarrator } from './story-narrator.js';

export type FeedbackVote = 'like' | 'dislike';

export const LIKE_REASONS = ['interesting_fact', 'good_speech', 'good_persona'] as const;
export const DISLIKE_REASONS = [
  'hallucination',
  'boring_fact',
  'unnatural_voice',
  'speech_manner',
] as const;

export type LikeReason = (typeof LIKE_REASONS)[number];
export type DislikeReason = (typeof DISLIKE_REASONS)[number];

export interface StoryFeedbackEntry {
  id: string;
  installId: string;
  artist: string;
  title: string;
  vote: FeedbackVote;
  reason: string;
  script?: string;
  storyNarrator?: string;
  seedFact?: string;
  genre?: string;
  year?: number;
  lang?: string;
  at: number;
}

export interface StoryFeedbackRecordInput {
  installId: string;
  artist: string;
  title: string;
  vote: FeedbackVote;
  reason: string;
  script?: string;
  storyNarrator?: string;
  seedFact?: string;
  genre?: string;
  year?: number;
  lang?: string;
}

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const FEEDBACK_PATH = path.join(DATA_DIR, 'story-feedback.jsonl');

export function isValidFeedbackReason(vote: FeedbackVote, reason: string): boolean {
  if (vote === 'like') return (LIKE_REASONS as readonly string[]).includes(reason);
  return (DISLIKE_REASONS as readonly string[]).includes(reason);
}

export function recordStoryFeedback(entry: StoryFeedbackRecordInput): StoryFeedbackEntry {
  const record: StoryFeedbackEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    ...entry,
  };

  if (hasPostgres()) {
    void getPool()
      .query(
        `INSERT INTO story_feedback (id, install_id, artist, title, vote, reason, script, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          record.id,
          record.installId,
          record.artist,
          record.title,
          record.vote,
          record.reason,
          record.script ?? null,
          record.at,
        ],
      )
      .catch((err) =>
        console.error('[feedback] postgres insert failed:', err instanceof Error ? err.message : err),
      );
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(FEEDBACK_PATH, `${JSON.stringify(record)}\n`, 'utf8');
  }

  console.log(
    `[feedback] ${record.vote} reason=${record.reason} install=${record.installId.slice(0, 8)} ` +
      `"${record.artist}" — "${record.title}"`,
  );

  try {
    void enrichFeedbackContext(record).then((ctx) => {
      processFeedbackForStyleLearning(record, {
        storyNarrator: ctx.storyNarrator ?? resolveStoryNarrator(record.storyNarrator),
        seedFact: ctx.seedFact ?? record.seedFact,
        genre: ctx.genre ?? record.genre,
        year: ctx.year ?? record.year,
        lang: ctx.lang ?? ((record.lang === 'en' ? 'en' : 'ru') as StoryLanguageId),
      });
    });
  } catch (err) {
    console.warn('[style-learn] feedback hook failed:', err instanceof Error ? err.message : err);
  }

  return record;
}
