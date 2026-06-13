import fs from 'node:fs';
import path from 'node:path';
import {
  applyFactFeedbackPenalty,
  factFingerprint,
  ingestHarvestFacts,
  listBankFacts,
  type StoredFact,
} from './fact-bank.js';
import { harvestAllFacts } from './fact-sources/index.js';
import { fetchFastTrackWikiFacts } from './wikipedia-facts.js';
import { anchorsReferenceFact } from './story-quality.js';
import {
  adjustedInterestScore,
  isBoringFact,
  MIN_PICK_INTEREST_SCORE,
} from './reference-fact-quality.js';
import {
  computeLiveInterest,
  isEligibleHotFact,
  isRejectedPickSeed,
} from './fact-seed-pick.js';
import { isSpeakableReferenceFact } from './web-snippet-accept.js';
import type { StoryFeedbackEntry } from './story-feedback.js';
import type { StyleFeedbackContext } from './style-feedback-learn.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const ANALYSIS_LOG = path.join(DATA_DIR, 'feedback-fact-analysis.jsonl');

const harvestQueue = new Set<string>();

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantTokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length >= 4);
}

export interface TrackFactTierEntry {
  id: string;
  scope: string;
  interestScore: number;
  interestRating: number;
  effectiveScore: number;
  pickable: boolean;
  rejected: boolean;
  boring: boolean;
  hot: boolean;
  preview: string;
  wasUsedSeed: boolean;
}

export interface FeedbackFactAnalysis {
  feedbackId: string;
  reason: string;
  artist: string;
  title: string;
  seedFact?: string;
  seedScope?: string;
  seedInterestScore?: number;
  seedInterestRating?: number;
  scriptAnchored?: boolean;
  wikiGrounded?: boolean;
  tierReport?: TrackFactTierEntry[];
  betterAlternatives?: TrackFactTierEntry[];
  hadBetterUnused?: boolean;
  actions: string[];
  at: number;
}

function appendAnalysisLog(row: FeedbackFactAnalysis): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(ANALYSIS_LOG, `${JSON.stringify(row)}\n`, 'utf8');
  } catch (err) {
    console.warn(
      '[feedback-analysis] log write failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

function buildTierEntry(
  fact: StoredFact,
  artist: string,
  title: string,
  trackPoolFacts: string[],
  seedFp: string | null,
): TrackFactTierEntry {
  const live = computeLiveInterest(fact.fact);
  const penalty = (fact.feedbackDislikes ?? 0) * 4;
  const effectiveScore = Math.max(0, live.score - penalty);
  const rejected = isRejectedPickSeed(fact.fact, title, 'ru', trackPoolFacts, artist);
  const pickable =
    !rejected &&
    effectiveScore >= MIN_PICK_INTEREST_SCORE &&
    live.rating >= 6 &&
    isSpeakableReferenceFact(fact.fact, artist, title);
  const hot = isEligibleHotFact(fact.fact, {
    metadata: fact.isMetadata,
    artist,
    title,
    trackPool: trackPoolFacts,
  });
  return {
    id: fact.id,
    scope: fact.scope,
    interestScore: live.score,
    interestRating: live.rating,
    effectiveScore,
    pickable,
    rejected,
    boring: isBoringFact(fact.fact),
    hot,
    preview: fact.fact.length > 120 ? `${fact.fact.slice(0, 120)}…` : fact.fact,
    wasUsedSeed: seedFp != null && factFingerprint(fact.fact) === seedFp,
  };
}

async function verifySeedWikiGrounding(
  artist: string,
  title: string,
  seed: string,
): Promise<boolean> {
  try {
    const snippets = await fetchFastTrackWikiFacts(artist, title);
    if (snippets.length === 0) return false;
    const tokens = significantTokens(seed).slice(0, 8);
    if (tokens.length === 0) return false;
    const required = Math.min(3, tokens.length);
    return snippets.some((snippet) => {
      const sn = normalize(snippet);
      const hits = tokens.filter((t) => sn.includes(t)).length;
      return hits >= required;
    });
  } catch (err) {
    console.warn(
      '[feedback-analysis] wiki check failed:',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

async function queueBackgroundHarvest(artist: string, title: string): Promise<void> {
  const key = `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
  if (harvestQueue.has(key)) return;
  harvestQueue.add(key);
  try {
    process.env.HARVEST_RATE_LIMIT = 'true';
    process.env.BULK_HARVEST = 'true';
    const facts = await harvestAllFacts({ artist, title });
    const substantive = facts.filter(
      (f) => !f.metadataOnly && f.fact.trim().length >= 35,
    );
    if (substantive.length === 0) {
      console.log(`[feedback-analysis] harvest empty "${artist}" — "${title}"`);
      return;
    }
    const ingested = ingestHarvestFacts(
      artist,
      title,
      substantive.map((f) => ({
        fact: f.fact,
        scope: f.scope,
        source: 'api' as const,
        harvestSource: f.source,
        minScore: 3,
      })),
    );
    console.log(
      `[feedback-analysis] background harvest "${artist}" — "${title}" ` +
        `facts=${substantive.length} ingested=${ingested}`,
    );
  } catch (err) {
    console.warn(
      `[feedback-analysis] background harvest failed "${artist}" — "${title}":`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    harvestQueue.delete(key);
  }
}

function analyzeBoringTier(
  entry: StoryFeedbackEntry,
  ctx: StyleFeedbackContext,
): FeedbackFactAnalysis {
  const seed = ctx.seedFact?.trim();
  const actions: string[] = [];
  const { track, artist: artistFacts } = listBankFacts(entry.artist, entry.title);
  const allFacts = [...track, ...artistFacts];
  const trackPoolFacts = track.map((f) => f.fact);
  const seedFp = seed ? factFingerprint(seed) : null;

  const tierReport = allFacts
    .map((f) => buildTierEntry(f, entry.artist, entry.title, trackPoolFacts, seedFp))
    .sort((a, b) => b.effectiveScore - a.effectiveScore);

  const seedEntry = tierReport.find((t) => t.wasUsedSeed);
  const seedScore =
    seedEntry?.effectiveScore ??
    ctx.seedInterestScore ??
    (seed ? computeLiveInterest(seed).score : 0);
  const seedRating = seedEntry?.interestRating ?? ctx.seedInterestRating;

  const betterAlternatives = tierReport.filter(
    (t) =>
      !t.wasUsedSeed &&
      t.pickable &&
      t.effectiveScore > seedScore + 2 &&
      adjustedInterestScore(
        allFacts.find((f) => f.id === t.id)?.fact ?? '',
        'auto',
      ) > seedScore,
  );

  const hadBetterUnused = betterAlternatives.length > 0;

  if (seed) {
    applyFactFeedbackPenalty(entry.artist, entry.title, seed, 'boring_fact');
    actions.push('seed_penalized_boring');
  }

  if (hadBetterUnused) {
    actions.push(`had_${betterAlternatives.length}_better_pickable_facts`);
    console.warn(
      `[feedback-analysis] boring_fact "${entry.artist}" — "${entry.title}" ` +
        `seedScore=${seedScore} better=${betterAlternatives.length} ` +
        `topAlt=${betterAlternatives[0]?.preview.slice(0, 80) ?? '?'}`,
    );
  } else if (tierReport.filter((t) => t.pickable && !t.wasUsedSeed).length === 0) {
    actions.push('no_better_facts_trigger_harvest');
    void queueBackgroundHarvest(entry.artist, entry.title);
    console.warn(
      `[feedback-analysis] boring_fact no alternatives — harvesting "${entry.artist}" — "${entry.title}"`,
    );
  } else {
    actions.push('low_bank_coverage_review_pick_order');
  }

  return {
    feedbackId: entry.id,
    reason: entry.reason,
    artist: entry.artist,
    title: entry.title,
    seedFact: seed,
    seedScope: ctx.seedScope,
    seedInterestScore: seedScore,
    seedInterestRating: seedRating,
    tierReport: tierReport.slice(0, 12),
    betterAlternatives: betterAlternatives.slice(0, 5),
    hadBetterUnused,
    actions,
    at: Date.now(),
  };
}

async function analyzeHallucination(
  entry: StoryFeedbackEntry,
  ctx: StyleFeedbackContext,
): Promise<FeedbackFactAnalysis> {
  const seed = ctx.seedFact?.trim();
  const script = entry.script?.trim();
  const actions: string[] = [];

  let scriptAnchored: boolean | undefined;
  let wikiGrounded: boolean | undefined;

  if (seed && script) {
    scriptAnchored = anchorsReferenceFact(script, [seed]);
    if (!scriptAnchored) {
      actions.push('script_not_anchored_to_seed_llm_drift');
    } else {
      actions.push('script_anchored_to_seed');
    }
  } else if (!seed) {
    actions.push('no_seed_for_factcheck');
  }

  if (seed) {
    wikiGrounded = await verifySeedWikiGrounding(entry.artist, entry.title, seed);
    if (!wikiGrounded) {
      actions.push('seed_not_wiki_grounded');
      applyFactFeedbackPenalty(entry.artist, entry.title, seed, 'hallucination');
      actions.push('seed_penalized_hallucination');
    } else {
      actions.push('seed_wiki_grounded');
      if (scriptAnchored === false) {
        actions.push('likely_llm_invention_not_seed_error');
      }
    }
  }

  console.warn(
    `[feedback-analysis] hallucination "${entry.artist}" — "${entry.title}" ` +
      `anchored=${scriptAnchored ?? '?'} wiki=${wikiGrounded ?? '?'} actions=${actions.join(',')}`,
  );

  return {
    feedbackId: entry.id,
    reason: entry.reason,
    artist: entry.artist,
    title: entry.title,
    seedFact: seed,
    seedScope: ctx.seedScope,
    seedInterestScore: ctx.seedInterestScore,
    seedInterestRating: ctx.seedInterestRating,
    scriptAnchored,
    wikiGrounded,
    actions,
    at: Date.now(),
  };
}

/** Async analysis for dislike reasons tied to fact quality. */
export async function processNegativeFactFeedback(
  entry: StoryFeedbackEntry,
  ctx: StyleFeedbackContext,
): Promise<FeedbackFactAnalysis | null> {
  if (entry.vote !== 'dislike') return null;

  let analysis: FeedbackFactAnalysis | null = null;
  if (entry.reason === 'boring_fact') {
    analysis = analyzeBoringTier(entry, ctx);
  } else if (entry.reason === 'hallucination') {
    analysis = await analyzeHallucination(entry, ctx);
  } else {
    return null;
  }

  appendAnalysisLog(analysis);
  return analysis;
}
