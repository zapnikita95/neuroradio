/**
 * Test Gemini via production Railway BFF (after GEMINI_API_KEY deploy).
 * Run: node scripts/test-production-gemini.mjs
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { validateStoryScript, countWords, findWateryContent } from '../dist/services/story-quality.js';
import { hasEnglishLeak } from '../dist/services/story-russian-language.js';

const baseUrl = (process.env.RAILWAY_URL || 'https://music-story-production.up.railway.app').replace(/\/$/, '');
const packageName = process.env.ALLOWED_PACKAGE_NAME?.trim() || 'com.musicstory.app';
const certSha256 = (
  process.env.ALLOWED_CERT_SHA256?.split(',')[0] ??
  'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc'
)
  .trim()
  .replace(/:/g, '')
  .toLowerCase();

const TRACKS = [
  { artist: 'Stromae', title: 'Alors on danse (Radio Edit)', year: 2009, genre: 'electronic' },
  { artist: 'ABBA', title: 'Dancing Queen', year: 1976, genre: 'pop' },
  { artist: 'Redbone', title: 'Come and Get Your Love', year: 1974, genre: 'rock' },
  { artist: 'Nirvana', title: 'Smells Like Teen Spirit', year: 1991, genre: 'grunge' },
  { artist: 'Кино', title: 'Группа крови', year: 1988, genre: 'rock' },
];

function resolveJwtSecret() {
  const explicit = process.env.AUTH_JWT_SECRET?.trim();
  if (explicit && explicit.length >= 32) return explicit;
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) return null;
  return crypto.createHmac('sha256', 'music-story-app-jwt-v1').update(groqKey).digest('hex');
}

async function fetchAuthToken() {
  const secret = resolveJwtSecret();
  if (!secret) throw new Error('Cannot derive JWT — set GROQ_API_KEY or AUTH_JWT_SECRET in backend/.env');

  const installId = process.env.INSTALL_ID?.trim() || crypto.randomUUID();
  const res = await fetch(`${baseUrl}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      install_id: installId,
      package_name: packageName,
      cert_sha256: certSha256,
      app_version: 'gemini-test',
    }),
  });
  if (!res.ok) throw new Error(`Auth ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).access_token;
}

async function fetchStory(token, track) {
  const res = await fetch(`${baseUrl}/v1/story/full`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      artist: track.artist,
      title: track.title,
      year: track.year,
      genre: track.genre,
      story_length: '30s',
      story_narrator: 'contemporary',
      llm_provider: 'gemini',
      previous_scripts: [],
    }),
    signal: AbortSignal.timeout(90000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Story ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function main() {
  console.log('=== Health ===');
  const healthRes = await fetch(`${baseUrl}/health`);
  const health = await healthRes.json();
  console.log(JSON.stringify(health, null, 2));
  if (!health.gemini) {
    console.error('\nWARN: health.gemini=false — redeploy Railway after adding GEMINI_API_KEY');
  }

  console.log('\n=== Gemini stories (llm_provider=gemini) ===\n');
  const token = await fetchAuthToken();
  let failed = 0;

  for (let i = 0; i < TRACKS.length; i++) {
    const track = TRACKS[i];
    const label = `${track.artist} — ${track.title}`;
    if (i > 0) await new Promise((r) => setTimeout(r, 3000));

    try {
      const data = await fetchStory(token, track);
      const script = data.script ?? '';
      const words = data.word_count ?? countWords(script);
      const quality = validateStoryScript(script, '30s', track.artist, track.title, { strictLength: false });
      const dry = findWateryContent(script, track.artist, track.title);
      const english = hasEnglishLeak(script, track.artist, track.title);
      const issues = [];
      if (data.demo) issues.push('demo fallback');
      if (!quality.ok) issues.push(quality.reason);
      if (dry) issues.push(`watery: ${dry}`);
      if (english) issues.push('english leak');
      if (!data.sources?.gemini) issues.push('sources.gemini=false');

      if (issues.length) {
        failed++;
        console.error(`FAIL: ${label} (${words}w) — ${issues.join('; ')}`);
        console.error(`  ${script.slice(0, 320)}${script.length > 320 ? '…' : ''}\n`);
      } else {
        console.log(`OK: ${label} (${words}w, gemini=${data.sources?.gemini})`);
        console.log(`  ${script.slice(0, 280)}${script.length > 280 ? '…' : ''}\n`);
      }
    } catch (err) {
      failed++;
      console.error(`ERROR: ${label}: ${err instanceof Error ? err.message : err}\n`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
