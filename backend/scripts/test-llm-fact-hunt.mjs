/**
 * LLM fact-hunt: offline verification + optional live hunt.
 * Run: npm run build && node scripts/test-llm-fact-hunt.mjs
 */
import 'dotenv/config';
import {
  verifyLlmSeedEvidence,
  validateLlmSeedCandidate,
  huntReferenceFactWithLlm,
  shouldRunLlmFactHunt,
} from '../dist/services/story-llm-fact-hunt.js';
import { fetchAggregatedFactContext } from '../dist/services/fact-aggregator.js';
import { hasGroqApiKey } from '../dist/services/groq.js';
import { hasGeminiApiKey } from '../dist/services/gemini.js';

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK: ${msg}`);
}

const SNIPPET =
  'Bohemian Rhapsody was recorded across three studios in 1975. Freddie Mercury wrote the operatic section at home before the band reunited for the famous multi-part arrangement.';

console.log('=== Offline evidence ===');
if (!verifyLlmSeedEvidence('operatic section at home', SNIPPET)) {
  fail('evidence substring match');
} else {
  ok('evidence substring match');
}

const goodParsed = {
  fact: 'Mercury сочинил оперную часть Bohemian Rhapsody дома, до многоделённой записи в трёх студиях.',
  scope: 'track',
  evidenceSnippetIndex: 0,
  evidenceQuote: 'Freddie Mercury wrote the operatic section at home',
};
const goodVal = validateLlmSeedCandidate(goodParsed, [SNIPPET], 'Queen', 'Bohemian Rhapsody');
if (!goodVal.ok) {
  fail(`good seed: ${goodVal.reason}`);
} else {
  ok('good seed validated');
}

const badRacism = {
  fact: 'Трек наполнен темой расизма и дискриминации, артист борется с несправедливостью.',
  scope: 'track',
  evidenceSnippetIndex: 0,
  evidenceQuote: 'operatic section at home',
};
const badVal = validateLlmSeedCandidate(badRacism, [SNIPPET], 'Queen', 'Bohemian Rhapsody');
if (badVal.ok) {
  fail('racism seed should be rejected');
} else {
  ok(`racism seed rejected (${badVal.reason})`);
}

const weakSnippet =
  'The song reached number one on the chart in 2010 and was featured on streaming playlists.';
const weakParsed = {
  fact: 'The song reached number one on the Billboard chart in 2010.',
  scope: 'track',
  evidenceSnippetIndex: 0,
  evidenceQuote: 'reached number one on the chart',
};
const weakVal = validateLlmSeedCandidate(weakParsed, [weakSnippet], 'Test', 'Song');
if (weakVal.ok) {
  fail('weak trivia seed should be rejected');
} else {
  ok(`weak trivia rejected (${weakVal.reason})`);
}

const fakeEvidence = {
  fact: 'Песня стала гимном равенства и справедливости для всего мира.',
  scope: 'track',
  evidenceSnippetIndex: 0,
  evidenceQuote: 'completely invented quote not in snippet',
};
const fakeVal = validateLlmSeedCandidate(fakeEvidence, [SNIPPET], 'Queen', 'Bohemian Rhapsody');
if (fakeVal.ok) {
  fail('fake evidence should be rejected');
} else {
  ok(`fake evidence rejected (${fakeVal.reason})`);
}

console.log('\n=== shouldRunLlmFactHunt ===');
if (!shouldRunLlmFactHunt(null, 3, 0)) {
  fail('should hunt when no selected and has snippets');
} else {
  ok('hunt when empty bundle + snippets');
}
if (shouldRunLlmFactHunt(null, 0, 0)) {
  fail('should not hunt without snippets');
} else {
  ok('no hunt without snippets');
}

const TRACKS = [
  { artist: 'Jencarlos', title: 'Caramba' },
  { artist: 'Queen', title: 'Bohemian Rhapsody' },
  { artist: 'Redbone', title: 'Come and Get Your Love' },
];

console.log('\n=== Aggregated context (no LLM) ===');
for (const t of TRACKS) {
  const ctx = await fetchAggregatedFactContext(t.artist, t.title);
  const n = ctx.rawSnippets.length;
  const b = ctx.bundle.trackFacts.length + ctx.bundle.artistFacts.length;
  console.log(`${t.artist} — ${t.title}: bundle=${b} raw=${n}`);
  if (n === 0 && b === 0) {
    console.warn(`  WARN: no sources at all`);
  }
}

if (!hasGroqApiKey() && !hasGeminiApiKey()) {
  console.warn('\nSKIP live LLM fact-hunt — no API keys');
  process.exit(failed > 0 ? 1 : 0);
}

console.log('\n=== Live LLM fact-hunt (Jencarlos) ===');
const jCtx = await fetchAggregatedFactContext('Jencarlos', 'Caramba');
if (jCtx.rawSnippets.length === 0) {
  console.warn('SKIP live — no raw snippets for Jencarlos');
  process.exit(failed > 0 ? 1 : 0);
}

try {
  const hunted = await huntReferenceFactWithLlm({
    artist: 'Jencarlos',
    title: 'Caramba',
    rawSnippets: jCtx.rawSnippets,
    preferredProvider: hasGroqApiKey() ? 'groq' : 'gemini',
  });
  if (!hunted) {
    fail('live hunt returned null');
  } else if (/расизм|дискриминац/i.test(hunted.fact)) {
    fail(`live hunt invented racism: ${hunted.fact.slice(0, 120)}`);
  } else {
    ok(`live hunt: ${hunted.fact.slice(0, 160)}…`);
  }
} catch (err) {
  fail(`live hunt error: ${err instanceof Error ? err.message : err}`);
}

process.exit(failed > 0 ? 1 : 0);
