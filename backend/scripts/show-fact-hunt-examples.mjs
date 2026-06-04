#!/usr/bin/env node
/**
 * Production-like fact-hunt examples — uses real prompt + validator.
 * Run: npm run build && node scripts/show-fact-hunt-examples.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '..');

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

loadEnvFile(resolve(repoRoot, '.env'));
loadEnvFile(resolve(root, '.env'));

const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error('OPEN_ROUTER_API_KEY missing');
  process.exit(1);
}

const { FACT_HUNT_LLM_PROMPT_BLOCK } = await import('../dist/services/story-fact-hunt.js');
const { validateLlmSeedCandidate } = await import('../dist/services/story-llm-fact-hunt.js');
const { interestScore } = await import('../dist/services/reference-fact-quality.js');

const MODELS = [
  'deepseek/deepseek-chat-v3-0324',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'google/gemma-4-26b-a4b-it',
];

/** Сниппеты как в жизни: чарт есть, но есть и биография — модель должна взять биографию */
const SNIPPETS = [
  'Pat and Lafe Vegas formed Redbone in 1969; the name refers to a Cajun term for a mixed-race person, reflecting their Native American and Mexican-American heritage.',
  'Before their breakthrough, the brothers performed in Los Angeles clubs and were often marketed as a Latin band rather than as Native American musicians.',
  'Come and Get Your Love reached No. 5 on the Billboard Hot 100 in April 1974.',
  'Pat Vegas later said the band faced racism from radio programmers who refused to play their records or pigeonholed them by ethnicity.',
  'The song was used in the 2014 film Guardians of the Galaxy, which led to a streaming revival decades after release.',
];

const system = `Ты — исследователь музыкальных фактов. Отвечай ТОЛЬКО валидным JSON.
${FACT_HUNT_LLM_PROMPT_BLOCK}

Формат успеха:
{"fact":"...","scope":"track"|"artist","evidenceSnippetIndex":0,"evidenceQuote":"..."}
Формат отказа:
{"reject":true,"reason":"..."}`;

const user = [
  'Артист: Redbone',
  'Трек: Come and Get Your Love',
  'Год: 1974',
  '',
  'СНИППЕТЫ (выбери один для семени):',
  ...SNIPPETS.map((s, i) => `${i}. ${s}`),
].join('\n');

console.log('=== ВХОД: сниппеты (есть чарт #2, но есть биография/расизм) ===\n');
SNIPPETS.forEach((s, i) => console.log(`${i}. ${s}\n`));

for (const model of MODELS) {
  console.log('\n' + '='.repeat(64));
  console.log('МОДЕЛЬ:', model);
  console.log('='.repeat(64));
  const started = Date.now();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://music-story.app',
        'X-Title': 'Music Story examples',
      },
      body: JSON.stringify({
        model,
        temperature: 0.22,
        max_tokens: 512,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    });
    const ms = Date.now() - started;
    const body = await res.text();
    if (!res.ok) {
      console.log(`HTTP ${res.status}:`, body.slice(0, 400));
      continue;
    }
    const data = JSON.parse(body);
    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    console.log(`Время: ${ms} ms`);
    console.log('Сырой ответ:', JSON.stringify(parsed, null, 2));

    const validated = validateLlmSeedCandidate(parsed, SNIPPETS, 'Redbone', 'Come and Get Your Love');
    if (validated.ok) {
      console.log(`\n✅ ПРОШЛО ВАЛИДАТОР ПРОДА: interestScore=${interestScore(validated.fact)}`);
      console.log(`Сниппет #${validated.snippetIndex}: ${SNIPPETS[validated.snippetIndex]}`);
      console.log(`\nФАКТ ДЛЯ ИСТОРИИ:\n${validated.fact}`);
    } else {
      console.log(`\n❌ ОТКЛОНЕНО ВАЛИДАТОРОМ: ${validated.reason}`);
    }
  } catch (e) {
    console.log('ОШИБКА:', e.message);
  }
  await new Promise((r) => setTimeout(r, 1200));
}
