#!/usr/bin/env node
/**
 * Sequential smoke-test of every OpenRouter preset in openrouter-models.ts.
 * Uses production-like Russian story JSON prompt (Michael Jackson / They Don't Care About Us).
 *
 * Run: npm run build && node scripts/test-all-openrouter-models.mjs
 * Key: OPEN_ROUTER_API_KEY from repo .env.example / backend/.env
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');
const RESULTS_PATH = resolve(__dirname, 'openrouter-model-results.json');
const delayArg = process.argv.find((a) => a.startsWith('--delay-ms='));
const DELAY_MS = delayArg ? Math.max(0, parseInt(delayArg.split('=')[1], 10) || 3000) : 3000;
const TIMEOUT_MS = 90000;

const ARTIST = 'Michael Jackson';
const TITLE = "They Don't Care About Us";
const SEED =
  'Протестная песня с альбома HIStory; клипы снимали в трущобах Рио и тюрьме; скандал из-за антисемитских обвинений.';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(repoRoot, '.env.example'));
loadEnvFile(resolve(repoRoot, '.env'));
loadEnvFile(resolve(root, '.env'));

const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error('OPEN_ROUTER_API_KEY missing — add to .env.example or backend/.env');
  process.exit(1);
}

/** Fallback if dist not built — keep in sync with openrouter-models.ts */
const FALLBACK_MODELS = [
  'liquid/lfm-2.5-1.2b-instruct:free',
  'openrouter/free',
  'deepseek/deepseek-v4-flash:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'openai/gpt-oss-120b:free',
];

async function loadPresetModels() {
  const distPath = resolve(root, 'dist/services/openrouter-models.js');
  if (!existsSync(distPath)) {
    console.warn('[test-all] dist missing — using fallback model list (run npm run build first)');
    return FALLBACK_MODELS;
  }
  const mod = await import(`file://${distPath.replace(/\\/g, '/')}`);
  return mod.OPENROUTER_FREE_MODELS.map((m) => m.id);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildStoryPrompts() {
  const storySystem = `Ты пишешь текст для ОЗВУЧКИ — харизматичный музыкальный рассказчик.

РОЛЬ: барный рассказчик про музыку
ГОЛОС: разговорный русский, без Wikipedia-тона

ЯЗЫК: только русский. Английский — только внутри «имя артиста» или «название трека».

ЖЁСТКИЙ ОБЪЁМ: 72–100 слов (~30 сек речи).

ОБЯЗАТЕЛЬНО: в тексте узнаётся СЕМЯ факта; слушатель понимает ПОЧЕМУ это важно.

Ответ — ТОЛЬКО валидный JSON:
{"script":"...","word_count":N,"voiceId":"zahar"}`;

  const storyUser = [
    `Артист: ${ARTIST}`,
    `Трек: ${TITLE}`,
    `Год: 1995`,
    `Жанр: pop`,
    '',
    `СЕМЯ (опорный факт): ${SEED}`,
    '',
    'Напиши короткий русский рассказ для озвучки по семени. word_count — число слов в script.',
  ].join('\n');

  return { storySystem, storyUser };
}

function classifyError(err, status) {
  if (status === 429 || /\b429\b|rate.?limit/i.test(String(err))) return 'rate_limit';
  if (/timeout|aborted|AbortError/i.test(String(err))) return 'timeout';
  return 'fail';
}

function parseStoryJson(raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.script || typeof parsed.script !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function testModel(model, storySystem, storyUser) {
  const t0 = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || 'https://music-story.app',
        'X-Title': 'Music Story test-all',
      },
      body: JSON.stringify({
        model,
        temperature: 0.48,
        max_tokens: 720,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: storySystem },
          { role: 'user', content: storyUser },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = await res.text();
    const ms = Date.now() - t0;

    if (!res.ok) {
      const status = classifyError(body, res.status);
      return {
        model,
        status,
        ms,
        error: body.slice(0, 220),
      };
    }

    let content = '';
    try {
      const data = JSON.parse(body);
      content = data.choices?.[0]?.message?.content ?? '';
    } catch {
      return { model, status: 'fail', ms, error: 'invalid API JSON response' };
    }

    if (!content.trim()) {
      return { model, status: 'empty', ms, error: 'empty content' };
    }

    const story = parseStoryJson(content);
    if (!story || story.script.length < 20) {
      return {
        model,
        status: 'fail',
        ms,
        error: `invalid story JSON: ${content.slice(0, 120)}`,
      };
    }

    return { model, status: 'ok', ms, error: null, scriptPreview: story.script.slice(0, 80) };
  } catch (err) {
    const ms = Date.now() - t0;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      model,
      status: classifyError(msg),
      ms,
      error: msg.slice(0, 220),
    };
  }
}

const models = await loadPresetModels();
const { storySystem, storyUser } = buildStoryPrompts();
const results = [];

console.log(`Testing ${models.length} OpenRouter presets (${ARTIST} — ${TITLE})`);
console.log(`Delay between calls: ${DELAY_MS}ms\n`);

for (let i = 0; i < models.length; i++) {
  const model = models[i];
  process.stdout.write(`[${i + 1}/${models.length}] ${model} … `);
  const row = await testModel(model, storySystem, storyUser);
  results.push(row);
  console.log(`${row.status} (${row.ms}ms)`);
  if (i + 1 < models.length) await sleep(DELAY_MS);
}

const summary = {
  testedAt: new Date().toISOString(),
  artist: ARTIST,
  title: TITLE,
  delayMs: DELAY_MS,
  results,
};

writeFileSync(RESULTS_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(`\nWrote ${RESULTS_PATH}`);

const ok = results.filter((r) => r.status === 'ok').length;
const fail = results.length - ok;
console.log(`Summary: ${ok} ok, ${fail} not ok\n`);

console.log('Model'.padEnd(42) + 'Status'.padEnd(14) + 'ms');
console.log('-'.repeat(62));
for (const r of results) {
  console.log(r.model.padEnd(42) + r.status.padEnd(14) + String(r.ms));
}

process.exit(fail > 0 ? 1 : 0);
