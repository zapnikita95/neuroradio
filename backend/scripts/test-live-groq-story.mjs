/**
 * Live Groq smoke test — same path as Android (json_object + fallback).
 * Run: npm run build && node scripts/test-live-groq-story.mjs
 * Requires GROQ_API_KEY in backend/.env
 */
import 'dotenv/config';
import fetch from 'node-fetch';
import { fetchAggregatedFactBundle } from '../dist/services/fact-aggregator.js';
import { pickReferenceFact } from '../dist/services/fact-picker.js';
import { buildPersonaForNarrator, buildStoryUserPrompt, buildSystemPrompt } from '../dist/services/prompts.js';
import { resolveStoryNarrator } from '../dist/services/story-narrator.js';
import { DEFAULT_STORY_LENGTH, getStoryLengthPreset } from '../dist/services/story-length.js';
import { validateStoryScript } from '../dist/services/story-quality.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';

const TRACKS = [
  { artist: 'Stromae', title: 'Alors on danse (Radio Edit)' },
  { artist: 'Moby', title: 'Lift Me Up (2006 Digital Remaster)' },
];

async function callGroq(apiKey, system, user, useJsonMode) {
  const body = {
    model: MODEL,
    temperature: useJsonMode ? 0.72 : 0.65,
    max_tokens: 900,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (useJsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });

  const raw = await response.text();
  if (!response.ok) {
    if (useJsonMode && response.status === 400 && raw.includes('json_validate_failed')) {
      return { ok: false, jsonModeFailed: true, raw };
    }
    throw new Error(`Groq ${response.status}: ${raw.slice(0, 300)}`);
  }

  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  const parsed = JSON.parse(match[0]);
  if (!parsed.script) throw new Error('Missing script field');
  return { ok: true, script: parsed.script, words: parsed.script.trim().split(/\s+/).length };
}

async function generateForTrack(apiKey, artist, title) {
  const bundle = await fetchAggregatedFactBundle(artist, title, 'BE');
  const selected = pickReferenceFact(bundle, []);
  const facts = selected ? [selected.fact] : [...bundle.trackFacts, ...bundle.artistFacts].slice(0, 4);
  const length = getStoryLengthPreset(DEFAULT_STORY_LENGTH);
  const persona = buildPersonaForNarrator(resolveStoryNarrator(), undefined, undefined, artist, title, 'BE');
  const system = buildSystemPrompt(persona, length);
  const user = buildStoryUserPrompt({
    artist,
    title,
    countryCode: 'BE',
    angle: 'studio',
    storyLength: DEFAULT_STORY_LENGTH,
    previousScripts: [],
    referenceFacts: facts,
    selectedReferenceFact: selected ?? undefined,
  });

  let result = await callGroq(apiKey, system, user, true);
  if (!result.ok && result.jsonModeFailed) {
    console.log(`  JSON mode failed for ${artist} — retry plain`);
    result = await callGroq(apiKey, system, user, false);
  }
  if (!result.ok) throw new Error(`Failed both modes: ${result.raw?.slice(0, 200)}`);

  const quality = validateStoryScript(result.script, DEFAULT_STORY_LENGTH, artist, title, {
    referenceFacts: facts,
    strictLength: false,
  });
  if (!quality.ok) throw new Error(`Quality: ${quality.reason}`);
  return result;
}

const apiKey = process.env.GROQ_API_KEY?.trim();
if (!apiKey) {
  console.error('SKIP: GROQ_API_KEY not set in backend/.env');
  process.exit(1);
}

let failed = 0;
for (const track of TRACKS) {
  try {
    const result = await generateForTrack(apiKey, track.artist, track.title);
    console.log(`OK: ${track.artist} — ${track.title} (${result.words} words)`);
  } catch (err) {
    failed++;
    console.error(`FAIL: ${track.artist} — ${track.title}: ${err.message}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
