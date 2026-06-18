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
const { BFF_URL, fetchProdToken, postProdStoryFull, TEST_INSTALL_ID } = await import('./lib/prod-auth.mjs');

const args = process.argv.slice(2);
const prod = args.includes('--prod');
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
  const rejectSimilar = [];
  const picks = [];
  for (let offset = 0; offset < 20 && picks.length < count; offset += 1) {
    const hit = pickFromBank(artist, title, used, ['track', 'album', 'artist'], offset, rejectSimilar, new Set(), 'ru');
    if (!hit) continue;
    const fp = factFingerprint(hit.fact);
    if (used.has(fp)) continue;
    used.add(fp);
    rejectSimilar.push(hit.fact);
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
const tracks = pickTopTracks(bank, 10);
console.log(`\n=== BANK FACT STORY TEST (${tracks.length} tracks × ${STORIES_PER_TRACK} stories) ===\n`);

const results = [];
let token = null;
if (prod) {
  try {
    token = await fetchProdToken(TEST_INSTALL_ID);
    console.log('prod:', BFF_URL, '\n');
  } catch (e) {
    console.warn('prod unavailable:', e.message, '— local only\n');
  }
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
    let source = 'local-openrouter';

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

    if (token && si === 0) {
      const pt0 = Date.now();
      const prodRes = await postProdStoryFull(token, {
        artist,
        title,
        narrator,
        openRouterApiKey: process.env.OPEN_ROUTER_API_KEY?.trim(),
      });
      row.prodMs = prodRes.elapsedMs;
      row.prodOk = prodRes.ok;
      row.prodSeed = prodRes.seed ?? '';
      row.prodScript = prodRes.script ?? '';
      row.prodScope = prodRes.scope ?? '';
      if (prodRes.ok) {
        const pAnchored = anchorsReferenceFact(prodRes.script, [prodRes.seed || fact.fact], artist, title);
        console.log(`  PROD ${prodRes.elapsedMs}ms | scope=${prodRes.scope} | anchored=${pAnchored}`);
        console.log(`  PROD SEED: ${(prodRes.seed || '').slice(0, 180)}`);
        console.log(`  PROD SCRIPT: ${(prodRes.script || '').slice(0, 220)}…`);
      } else {
        console.warn(`  PROD FAIL: ${prodRes.error}`);
      }
      await new Promise((r) => setTimeout(r, 8000));
    }

    results.push(row);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const summary = {
  at: new Date().toISOString(),
  tracks: tracks.length,
  stories: results.length,
  localAvgMs: Math.round(results.reduce((s, r) => s + (r.localMs ?? 0), 0) / Math.max(1, results.length)),
  anchoredPct: Math.round((results.filter((r) => r.anchored).length / Math.max(1, results.length)) * 100),
  qualityOkPct: Math.round((results.filter((r) => r.qualityOk).length / Math.max(1, results.length)) * 100),
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
console.log(`stories: ${summary.stories} | local avg: ${summary.localAvgMs}ms | anchored: ${summary.anchoredPct}% | quality ok: ${summary.qualityOkPct}%`);
console.log(`distinct seeds/track:`, summary.distinctSeedsPerTrack);
console.log(`saved: ${OUT}\n`);
