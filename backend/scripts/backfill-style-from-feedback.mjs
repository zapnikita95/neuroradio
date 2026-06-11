#!/usr/bin/env node
/**
 * Reprocess good_persona feedback into style gold corpus.
 * Usage: cd backend && node scripts/backfill-style-from-feedback.mjs
 */
import { initPostgres, hasPostgres } from '../dist/services/db.js';
import { hydrateAccountStoreFromPostgres } from '../dist/services/account-store.js';
import {
  backfillStyleCorpusFromFeedback,
  summarizeGoodPersonaFeedback,
} from '../dist/services/style-feedback-backfill.js';

await initPostgres();
if (hasPostgres()) {
  await hydrateAccountStoreFromPostgres();
}

const summary = await summarizeGoodPersonaFeedback();
console.log('good_persona by narrator:', JSON.stringify(summary, null, 2));

const result = await backfillStyleCorpusFromFeedback();
console.log('backfill result:', JSON.stringify(result, null, 2));

process.exit(0);
