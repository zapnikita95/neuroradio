/**
 * Free OpenRouter models × persona narrators (production pipeline).
 * Run: npm run build && node scripts/test-free-models-narrators.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');
const OUT = resolve(__dirname, 'free-models-narrator-results.json');

for (const p of [
  resolve(repoRoot, '.env.example'),
  resolve(repoRoot, '.env'),
  resolve(root, '.env'),
]) {
  if (!existsSync(p)) continue;
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

if (!process.env.OPEN_ROUTER_API_KEY?.trim()) {
  console.error('OPEN_ROUTER_API_KEY missing');
  process.exit(1);
}

const mod = await import('../dist/services/openrouter.js');
const quality = await import('../dist/services/story-quality.js');
const modelsMod = await import('../dist/services/openrouter-models.js');

const { generateStoryScript } = mod;
const { findHardScriptViolation, findLlmGarbage, validateStoryScript } = quality;
const { buildOpenRouterFreeStoryModelChain, OPENROUTER_FREE_STORY_MODEL_CHAIN, OPENROUTER_DEFAULT_STORY_MODEL } = modelsMod;

const FREE_MODELS = [
  ...new Set([
    ...OPENROUTER_FREE_STORY_MODEL_CHAIN,
    OPENROUTER_DEFAULT_STORY_MODEL,
  ]),
];
const PRODUCTION_CHAIN = buildOpenRouterFreeStoryModelChain();

const NARRATORS = ['contemporary', 'fan'];
const DELAY_MS = 4000;

const SEED =
  'Michael Jackson invested five hundred thousand dollars of his own money in the Thriller music video. ' +
  'MTV primarily played rock; the fourteen-minute Thriller video was aired in full, interrupting regular programming. ' +
  'Album sales increased sevenfold after the video premiere. Director John Landis came from film; ' +
  'choreographer Michael Peters had to convince Landis to keep the zombie dance sequence. ' +
  'VHS tapes sold out in stores as people rewatched the video at home.';

const BASE_INPUT = {
  artist: 'Michael Jackson',
  title: 'Thriller',
  year: 1982,
  genre: 'pop',
  countryCode: 'US',
  voiceId: 'zahar',
  storyLength: '60s',
  referenceFacts: [SEED],
  selectedReferenceFact: { fact: SEED, scope: 'track', scopeLabelRu: 'трек' },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasFirstPerson(script) {
  return /\b(я|мы|меня|мне|мной|нам|нами)\b/i.test(script);
}

function hasNostalgia(script) {
  return /\b(помню|тогда|в\s+те\s+годы|в\s+восьмидесят|мы\s+тогда|впервые)\b/i.test(script);
}

function hasEnthusiasm(script) {
  return /\b(обожаю|без\s+ум|до\s+сих\s+пор|революц|безумн|восторг|цепляет)\b/i.test(script);
}

function truncatedSvojih(script) {
  return /\bсвоих\s+(?:\.|,|$|\)|»)/i.test(script) || /\bполмиллиона\s+своих\b(?!\s+(?:денег|доллар|рубл))/i.test(script);
}

async function runOne(modelOrChain, narrator, label) {
  const t0 = Date.now();
  try {
    const story = await generateStoryScript({
      ...BASE_INPUT,
      storyNarrator: narrator,
      ...(Array.isArray(modelOrChain)
        ? { openRouterModels: modelOrChain }
        : { openRouterModel: modelOrChain }),
    });
    const ms = Date.now() - t0;
    const script = story.script;
    const hard = findHardScriptViolation(script);
    const garbage = findLlmGarbage(script);
    const validation = validateStoryScript(script, {
      artist: BASE_INPUT.artist,
      title: BASE_INPUT.title,
      referenceFacts: BASE_INPUT.referenceFacts,
      storyLength: '60s',
      narratorId: narrator,
    });
    const checks = {
      firstPerson: hasFirstPerson(script),
      nostalgia: narrator === 'contemporary' ? hasNostalgia(script) : null,
      enthusiasm: narrator === 'fan' ? hasEnthusiasm(script) : null,
      truncatedSvojih: truncatedSvojih(script),
    };
    const issues = [];
    if (hard) issues.push(`hard: ${hard}`);
    if (garbage) issues.push(garbage);
    if (!validation.ok) issues.push(`validate: ${validation.reason}`);
    if (narrator === 'contemporary' && !checks.firstPerson) issues.push('no first person');
    if (narrator === 'fan' && !checks.firstPerson) issues.push('no first person');
    if (checks.truncatedSvojih) issues.push('truncated «своих»');
    return {
      model: label,
      narrator,
      status: issues.length ? 'warn' : 'ok',
      ms,
      words: story.word_count,
      issues,
      checks,
      script,
    };
  } catch (err) {
    return {
      model: label,
      narrator,
      status: 'fail',
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

console.log(`=== Free models × ${NARRATORS.join(', ')} (Thriller) ===\n`);
console.log(`Models (solo): ${FREE_MODELS.join(', ')}`);
console.log(`Production chain: ${PRODUCTION_CHAIN.join(' → ')}\n`);

const results = [];
let idx = 0;
const jobs = [
  ...FREE_MODELS.flatMap((model) =>
    NARRATORS.map((narrator) => ({ modelOrChain: model, narrator, label: model })),
  ),
  ...NARRATORS.map((narrator) => ({
    modelOrChain: PRODUCTION_CHAIN,
    narrator,
    label: `chain:${PRODUCTION_CHAIN.join('→')}`,
  })),
];
const total = jobs.length;

for (const job of jobs) {
  idx++;
  process.stdout.write(`[${idx}/${total}] ${job.label} / ${job.narrator} … `);
  const row = await runOne(job.modelOrChain, job.narrator, job.label);
    results.push(row);
    console.log(row.status + (row.error ? ` (${row.error.slice(0, 60)})` : ` ${row.ms}ms`));
    if (idx < total) await sleep(DELAY_MS);
}

writeFileSync(OUT, `${JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(`\nWrote ${OUT}\n`);

for (const model of FREE_MODELS) {
  console.log(`\n## ${model}`);
  for (const narrator of NARRATORS) {
    const r = results.find((x) => x.model === model && x.narrator === narrator);
    if (!r) continue;
    console.log(`\n--- ${narrator} [${r.status}] ${r.words ?? '?'} words ---`);
    if (r.error) {
      console.log(`ERROR: ${r.error}`);
      continue;
    }
    if (r.issues?.length) console.log(`Issues: ${r.issues.join('; ')}`);
    if (r.checks) {
      console.log(
        `Checks: я/мы=${r.checks.firstPerson}` +
          (r.checks.nostalgia != null ? ` nostalgia=${r.checks.nostalgia}` : '') +
          (r.checks.enthusiasm != null ? ` enthusiasm=${r.checks.enthusiasm}` : ''),
      );
    }
    console.log(r.script?.slice(0, 400) + (r.script?.length > 400 ? '…' : ''));
  }
}

const ok = results.filter((r) => r.status === 'ok').length;
const warn = results.filter((r) => r.status === 'warn').length;
const fail = results.filter((r) => r.status === 'fail').length;
console.log(`\n=== Summary: ${ok} ok, ${warn} warn, ${fail} fail ===`);
