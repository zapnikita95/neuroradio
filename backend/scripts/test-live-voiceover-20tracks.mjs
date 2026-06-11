#!/usr/bin/env node
/**
 * Live LLM: 20 tracks with speakTrackNamesInVoiceover=false — check model output, not unit mocks.
 * npm run build && node scripts/test-live-voiceover-20tracks.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
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

await import('./setup-hidemy-proxy.mjs');

const TRACKS = [
  { artist: 'Foster The People', title: 'Sit Next to Me', cc: 'US' },
  { artist: 'The Offspring', title: 'Self Esteem', cc: 'US' },
  { artist: 'Red Hot Chili Peppers', title: 'Snow (Hey Oh)', cc: 'US' },
  { artist: 'Nirvana', title: 'Smells Like Teen Spirit', cc: 'US' },
  { artist: 'Queen', title: 'Bohemian Rhapsody', cc: 'GB' },
  { artist: 'Eminem', title: 'Lose Yourself', cc: 'US' },
  { artist: 'Stromae', title: 'Alors on danse', cc: 'BE' },
  { artist: 'Moby', title: 'Porcelain', cc: 'US' },
  { artist: 'Radiohead', title: 'Creep', cc: 'GB' },
  { artist: 'Daft Punk', title: 'Get Lucky', cc: 'FR' },
  { artist: 'Billie Eilish', title: 'bad guy', cc: 'US' },
  { artist: 'Arctic Monkeys', title: 'Do I Wanna Know?', cc: 'GB' },
  { artist: 'Кино', title: 'Группа крови', cc: 'RU' },
  { artist: 'Король и Шут', title: 'Лагерная Пыль', cc: 'RU' },
  { artist: 'Rammstein', title: 'Du Hast', cc: 'DE' },
  { artist: 'AC/DC', title: 'Thunderstruck', cc: 'AU' },
  { artist: 'Linkin Park', title: 'In the End', cc: 'US' },
  { artist: 'Beyoncé', title: 'Crazy in Love', cc: 'US' },
  { artist: 'EV', title: 'Cuppa Tea', cc: 'GB' },
  { artist: 'Pearl Jam', title: 'Black', cc: 'US' },
];

const { fetchAggregatedFactBundle } = await import('../dist/services/fact-aggregator.js');
const { pickReferenceFact } = await import('../dist/services/fact-picker.js');
const { generateStoryWithFallback } = await import('../dist/services/story-llm-router.js');
const { resolveLlmProvider } = await import('../dist/services/llm-provider.js');
const { buildOpenRouterFreeStoryModelChain } = await import('../dist/services/openrouter-models.js');
const { scriptLeaksVoiceoverNames } = await import('../dist/services/voiceover-no-names.js');
const { validateStoryScript } = await import('../dist/services/story-quality.js');
const { DEFAULT_STORY_LENGTH } = await import('../dist/services/story-length.js');
const { voiceForYear } = await import('../dist/services/voices.js');

// OpenRouter с own key (Groq 403 из РФ). Override: LIVE_TEST_LLM_PROVIDER=groq
const provider = process.env.LIVE_TEST_LLM_PROVIDER?.trim() || 'openrouter';
void resolveLlmProvider;
const groqModel = process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
const openRouterModels = buildOpenRouterFreeStoryModelChain(process.env.OPENROUTER_STORY_MODEL);
console.log(
  `LIVE voiceover no-names — ${TRACKS.length} tracks — provider=${provider}` +
    (provider === 'groq' ? ` model=${groqModel}` : ` models=${openRouterModels.join(' → ')}`) +
    '\n',
);

const results = [];

for (let i = 0; i < TRACKS.length; i++) {
  const { artist, title, cc } = TRACKS[i];
  const label = `${artist} — ${title}`;
  console.log('═'.repeat(72));
  console.log(`[${i + 1}/${TRACKS.length}] ${label}`);
  const t0 = Date.now();

  try {
    const bundle = await fetchAggregatedFactBundle(artist, title, cc);
    const selected = pickReferenceFact(bundle, []);
    const facts = selected
      ? [selected.fact, ...bundle.trackFacts, ...bundle.artistFacts].slice(0, 5)
      : [...bundle.trackFacts, ...bundle.artistFacts].slice(0, 5);

    if (facts.length === 0) {
      facts.push(`${artist} recorded ${title}.`);
    }

    const { story, llmUsed } = await generateStoryWithFallback(
      {
        artist,
        title,
        countryCode: cc,
        voiceId: voiceForYear(undefined, undefined),
        storyLength: DEFAULT_STORY_LENGTH,
        storyNarrator: 'expert',
        referenceFacts: facts,
        selectedReferenceFact: selected ?? undefined,
        speakTrackNamesInVoiceover: false,
        groqModel: provider === 'groq' ? groqModel : undefined,
        openRouterModel: provider === 'openrouter' ? openRouterModels[0] : undefined,
        openRouterModels: provider === 'openrouter' ? openRouterModels : undefined,
        // own key → router не уводит на openrouter без моделей
        clientGroqApiKey: provider === 'groq' ? process.env.GROQ_API_KEY : undefined,
        clientOpenRouterApiKey: provider === 'openrouter' ? process.env.OPEN_ROUTER_API_KEY : undefined,
      },
      provider,
    );

    const script = story.script?.trim() ?? '';
    const leak = scriptLeaksVoiceoverNames(script, artist, title);
    const quality = validateStoryScript(script, DEFAULT_STORY_LENGTH, artist, title, {
      referenceFacts: facts,
      speakTrackNamesInVoiceover: false,
      strictLength: false,
      skipPersonaCliches: true,
    });

    const ms = Date.now() - t0;
    const ok = !leak && quality.ok;
    results.push({ artist, title, ok, leak, qualityReason: quality.ok ? null : quality.reason, ms, llmUsed });

    console.log(`LLM: ${llmUsed} | ${ms}ms | ${story.word_count ?? '?'} слов`);
    if (leak) console.log(`УТЕЧКА: ${leak}`);
    if (!quality.ok) console.log(`QUALITY: ${quality.reason}`);
    console.log(`SCRIPT: ${script.slice(0, 320)}${script.length > 320 ? '…' : ''}`);
    console.log(ok ? '✓ OK' : '✗ FAIL');
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ artist, title, ok: false, error: err.message, ms });
    console.log(`ERROR (${ms}ms): ${err.message}`);
    console.log('✗ FAIL');
  }
  console.log('');
}

const passed = results.filter((r) => r.ok).length;
const leaked = results.filter((r) => r.leak).length;
const errored = results.filter((r) => r.error).length;

console.log('═'.repeat(72));
console.log(`ИТОГ: ${passed}/${TRACKS.length} без утечек и с quality OK`);
console.log(`Утечки имён: ${leaked} | Ошибки LLM: ${errored}`);
if (passed < TRACKS.length) {
  console.log('\nПровалы:');
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  - ${r.artist} — ${r.title}: ${r.error ?? r.leak ?? r.qualityReason}`);
  }
}

process.exit(passed === TRACKS.length ? 0 : 1);
