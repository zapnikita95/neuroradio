#!/usr/bin/env node
/**
 * 10 треков из facts-bank → несколько разных фактов → генерация истории.
 * npm run test:bank-stories
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
const repoRoot = resolve(root, '..');

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve(repoRoot, '.env'));
loadEnv(resolve(root, '.env'));

await import('../dist/load-env.js');

const BANK_PATH = resolve(root, 'data/facts-bank.json');
const OUT = resolve(root, 'data/test-bank-stories-result.json');

const {
  listBankFacts,
  pickFromBank,
  factFingerprint,
} = await import('../dist/services/fact-bank.js');
const { generateStoryScript } = await import('../dist/services/groq.js');
const { resolveOpenRouterModelOrder } = await import('../dist/services/openrouter-models.js');
const { generateStoryScript: generateOpenRouterStory } = await import('../dist/services/openrouter.js');
const { anchorsReferenceFact, validateStoryScript } = await import('../dist/services/story-quality.js');
const { BFF_URL, fetchProdToken, postProdStoryFull, postProdStoryComplete, testInstallId } = await import('./lib/prod-auth.mjs');

const args = process.argv.slice(2);
const prod = args.includes('--prod');
const skipLocal = args.includes('--skip-local') || args.includes('--prod-only');
const maxTracksArg = args.find((a) => a.startsWith('--tracks='));
const MAX_TRACKS = maxTracksArg ? Number(maxTracksArg.split('=')[1]) : 10;
const narrators = ['night_dj', 'radio_host', 'storyteller'];
const STORIES_PER_TRACK = 3;

function pickTopTracks(bank, limit = 10) {
  const rows = [];
  for (const pool of Object.values(bank.byTrack ?? {})) {
    const substantive = pool.filter((f) => !f.isMetadata && f.fact.trim().length >= 35);
    const hot = substantive.filter((f) => f.isHot);
    if (substantive.length < 2 || !pool[0]?.artist || !pool[0]?.title) continue;
    rows.push({
      artist: pool[0].artist,
      title: pool[0].title,
      hot: hot.length,
      total: substantive.length,
    });
  }
  return rows
    .sort((a, b) => b.hot - a.hot || b.total - a.total)
    .slice(0, limit);
}

function pickDistinctFacts(artist, title, count = 3) {
  const used = new Set();
  const picks = [];
  for (let offset = 0; offset < 30 && picks.length < count; offset += 1) {
    const hit = pickFromBank(artist, title, used, ['track', 'album', 'artist'], offset, [], new Set(), 'ru', {
      markUsed: false,
    });
    if (!hit) continue;
    const fp = factFingerprint(hit.fact);
    if (used.has(fp)) continue;
    used.add(fp);
    picks.push(hit);
  }
  return picks;
}

function seedWordsInScript(seed, script) {
  const words = seed
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 5);
  const scriptLc = script.toLowerCase();
  const hits = words.filter((w) => scriptLc.includes(w));
  return { hits: hits.length, total: words.length, sample: hits.slice(0, 6) };
}

const bank = JSON.parse(readFileSync(BANK_PATH, 'utf8'));
const tracks = pickTopTracks(bank, MAX_TRACKS);
console.log(`\n=== BANK FACT STORY TEST (${tracks.length} tracks × ${STORIES_PER_TRACK} stories) ===\n`);

const results = [];
let prodToken = null;
if (prod) {
  try {
    prodToken = await fetchProdToken(testInstallId('prod-smoke'));
    console.log('prod:', BFF_URL, '\n');
  } catch (e) {
    console.warn('prod unavailable:', e.message, '— local only\n');
  }
}

async function callProdWithRetry(artist, title, narrator, storyKey, attempts = 3) {
  const installId = testInstallId(storyKey);
  let last = null;
  for (let a = 0; a < attempts; a += 1) {
    const token = await fetchProdToken(installId);
    const prodRes = await postProdStoryFull(token, {
      artist,
      title,
      narrator,
      openRouterApiKey: process.env.OPEN_ROUTER_API_KEY?.trim(),
    });
    last = { ...prodRes, installId, token };
    if (prodRes.ok) return last;
    const retryable =
      prodRes.status === 503 ||
      prodRes.status === 429 ||
      prodRes.code === 'story_in_progress' ||
      prodRes.code === 'STORY_QUALITY_FAILED';
    console.warn(
      `  PROD FAIL (${prodRes.elapsedMs}ms) code=${prodRes.code ?? prodRes.status} ${prodRes.message ?? prodRes.error}`,
    );
    if (!retryable || a === attempts - 1) break;
    await new Promise((r) => setTimeout(r, 4000 * (a + 1)));
  }
  return last;
}

async function generateLocalStory(input) {
  const orKey = process.env.OPEN_ROUTER_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (orKey) {
    return generateOpenRouterStory({
      ...input,
      clientOpenRouterApiKey: orKey,
      openRouterModels: resolveOpenRouterModelOrder(process.env.OPENROUTER_STORY_MODEL, 'story'),
    });
  }
  if (groqKey) {
    return generateStoryScript({ ...input, clientGroqApiKey: groqKey });
  }
  throw new Error('No OPEN_ROUTER_API_KEY or GROQ_API_KEY in .env');
}

for (let ti = 0; ti < tracks.length; ti += 1) {
  const { artist, title, hot, total } = tracks[ti];
  console.log(`\n--- [${ti + 1}/${tracks.length}] ${artist} — ${title} (bank: ${total} facts, ${hot} hot) ---`);
  const { track, artist: artistFacts } = listBankFacts(artist, title);
  console.log(`bank pool: track=${track.length} artist=${artistFacts.length}`);

  const facts = pickDistinctFacts(artist, title, STORIES_PER_TRACK);
  if (facts.length === 0) {
    console.warn('  SKIP: no pickable bank facts');
    continue;
  }

  const previousScripts = [];
  for (let si = 0; si < facts.length; si += 1) {
    const fact = facts[si];
    const narrator = narrators[si % narrators.length];
    console.log(`\n  [story ${si + 1}] scope=${fact.scope} rating=${fact.interestRating} narrator=${narrator}`);
    console.log(`  SEED: ${fact.fact.slice(0, 200)}${fact.fact.length > 200 ? '…' : ''}`);

    const t0 = Date.now();
    let script = '';
    let elapsedMs = 0;

    if (!skipLocal) {
      try {
        const story = await generateLocalStory({
          artist,
          title,
          voiceId: 'filipp',
          storyLength: '30s',
          storyNarrator: narrator,
          previousScripts,
          referenceFacts: [fact.fact],
          selectedReferenceFact: {
            fact: fact.fact,
            scope: fact.scope ?? 'track',
            scopeLabelRu: fact.scope === 'artist' ? 'артист' : fact.scope === 'album' ? 'альбом' : 'трек',
          },
          artistTier: 'major',
          storyLanguage: 'ru',
        });
        elapsedMs = Date.now() - t0;
        script = story.script;
      } catch (e) {
        elapsedMs = Date.now() - t0;
        console.warn(`  LOCAL FAIL (${elapsedMs}ms):`, e.message);
      }
    } else {
      console.log('  LOCAL skipped (--skip-local)');
    }

    const anchored = script ? anchorsReferenceFact(script, [fact.fact], artist, title) : false;
    const overlap = script ? seedWordsInScript(fact.fact, script) : { hits: 0, total: 0, sample: [] };
    const quality = script
      ? validateStoryScript(script, '30s', artist, title, { referenceFacts: [fact.fact], strictLength: false })
      : { ok: false, reason: 'no script' };

    console.log(`  LOCAL ${elapsedMs}ms | anchored=${anchored} | seedWords=${overlap.hits}/${overlap.total} | quality=${quality.ok ? 'ok' : quality.reason}`);
    if (script) {
      console.log(`  SCRIPT: ${script.slice(0, 280)}${script.length > 280 ? '…' : ''}`);
      previousScripts.push(script);
    }

    const row = {
      artist,
      title,
      storyIndex: si + 1,
      narrator,
      scope: fact.scope,
      interestRating: fact.interestRating,
      seed: fact.fact,
      localMs: elapsedMs,
      anchored,
      seedWordOverlap: overlap,
      qualityOk: quality.ok,
      qualityReason: quality.reason ?? null,
      script,
    };

    if (prodToken !== null) {
      const storyKey = ti * 10 + si + 1;
      const prodRes = await callProdWithRetry(artist, title, narrator, storyKey);
      row.prodMs = prodRes.elapsedMs;
      row.prodOk = prodRes.ok;
      row.prodCode = prodRes.code ?? null;
      row.prodError = prodRes.ok ? null : (prodRes.message ?? prodRes.error ?? null);
      row.prodSeed = prodRes.seed ?? '';
      row.prodScript = prodRes.script ?? '';
      row.prodScope = prodRes.scope ?? '';
      if (prodRes.ok) {
        const pAnchored = anchorsReferenceFact(prodRes.script, [prodRes.seed || fact.fact], artist, title);
        row.prodAnchored = pAnchored;
        console.log(`  PROD ${prodRes.elapsedMs}ms | scope=${prodRes.scope} | anchored=${pAnchored}`);
        console.log(`  PROD SEED: ${(prodRes.seed || '').slice(0, 180)}`);
        console.log(`  PROD SCRIPT: ${(prodRes.script || '').slice(0, 220)}…`);
        await postProdStoryComplete(prodRes.token, {
          artist,
          title,
          script: prodRes.script,
          seedFact: prodRes.seed || fact.fact,
          seedScope: prodRes.scope || fact.scope || 'track',
          narrator,
        });
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    results.push(row);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const summary = {
  at: new Date().toISOString(),
  tracks: tracks.length,
  stories: results.length,
  prodStories: results.filter((r) => r.prodOk).length,
  prodAvgMs: Math.round(
    results.filter((r) => r.prodOk).reduce((s, r) => s + (r.prodMs ?? 0), 0) /
      Math.max(1, results.filter((r) => r.prodOk).length),
  ),
  prodAnchoredPct: Math.round(
    (results.filter((r) => r.prodAnchored).length / Math.max(1, results.filter((r) => r.prodOk).length)) * 100,
  ),
  localAvgMs: Math.round(results.reduce((s, r) => s + (r.localMs ?? 0), 0) / Math.max(1, results.length)),
  anchoredPct: Math.round((results.filter((r) => r.anchored).length / Math.max(1, results.length)) * 100),
  qualityOkPct: Math.round((results.filter((r) => r.qualityOk).length / Math.max(1, results.length)) * 100),
  prodFailCodes: Object.fromEntries(
    [...new Set(results.filter((r) => !r.prodOk).map((r) => r.prodCode ?? 'unknown'))].map((c) => [
      c,
      results.filter((r) => !r.prodOk && (r.prodCode ?? 'unknown') === c).length,
    ]),
  ),
  distinctSeedsPerTrack: Object.fromEntries(
    tracks.map((t) => {
      const seeds = results.filter((r) => r.artist === t.artist && r.title === t.title).map((r) => r.seed.slice(0, 80));
      return [`${t.artist}|${t.title}`, [...new Set(seeds)].length];
    }),
  ),
  results,
};

writeFileSync(OUT, JSON.stringify(summary, null, 2), 'utf8');
console.log('\n=== SUMMARY ===');
console.log(`stories: ${summary.stories} | prod ok: ${summary.prodStories} avg ${summary.prodAvgMs}ms anchored ${summary.prodAnchoredPct}%`);
console.log(`local avg: ${summary.localAvgMs}ms | local anchored: ${summary.anchoredPct}% | quality ok: ${summary.qualityOkPct}%`);
console.log(`prod fail codes:`, summary.prodFailCodes);
console.log(`saved: ${OUT}\n`);
