/**
 * Benchmark story generation via production/local BFF (uses Railway Groq key).
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { validateStoryScript } from '../dist/services/story-quality.js';

const baseUrl = (process.env.RAILWAY_URL || 'https://music-story-production.up.railway.app').replace(
  /\/$/,
  '',
);
const packageName = process.env.ALLOWED_PACKAGE_NAME?.trim() || 'com.musicstory.app';
const certSha256 =
  (process.env.ALLOWED_CERT_SHA256?.split(',')[0] ??
    'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc')
    .trim()
    .replace(/:/g, '')
    .toLowerCase();

const DELAY_MS = Number(process.env.BENCHMARK_DELAY_MS ?? 35000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TRACKS = [
  { artist: 'Fanfare Ciocarlia', title: 'Moliendo café', year: 2016, genre: 'Balkan brass' },
  { artist: 'James Brown', title: 'I Got You (I Feel Good)', year: 1965, genre: 'funk' },
  { artist: 'Elvis Presley', title: 'Suspicious Minds', year: 1969, genre: 'rock' },
  { artist: 'The Beatles', title: 'Hey Jude', year: 1968, genre: 'pop' },
  { artist: 'Miles Davis', title: 'So What', year: 1959, genre: 'jazz' },
  { artist: 'Nirvana', title: 'Smell Like Teen Spirit', year: 1991, genre: 'rock' },
  { artist: 'ABBA', title: 'Dancing Queen', year: 1976, genre: 'pop' },
  { artist: 'Daft Punk', title: 'One More Time', year: 2000, genre: 'electronic' },
  { artist: '2Pac', title: 'California Love', year: 1996, genre: 'hip hop' },
  { artist: 'Metallica', title: 'Enter Sandman', year: 1991, genre: 'metal' },
  { artist: 'B.B. King', title: 'The Thrill Is Gone', year: 1969, genre: 'blues' },
  { artist: 'Kraftwerk', title: 'Autobahn', year: 1974, genre: 'electronic' },
  { artist: 'Billie Eilish', title: 'bad guy', year: 2019, genre: 'pop' },
  { artist: 'Ramones', title: 'Blitzkrieg Bop', year: 1976, genre: 'punk' },
  { artist: 'The Prodigy', title: 'Firestarter', year: 1996, genre: 'electronic' },
  { artist: 'Beyoncé', title: 'Crazy in Love', year: 2003, genre: 'pop' },
  { artist: 'Taylor Swift', title: 'Shake It Off', year: 2014, genre: 'pop' },
  { artist: 'Rammstein', title: 'Du Hast', year: 1997, genre: 'metal' },
  { artist: 'Louis Armstrong', title: 'What a Wonderful World', year: 1967, genre: 'jazz' },
  { artist: 'Bob Dylan', title: 'Like a Rolling Stone', year: 1965, genre: 'folk rock' },
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
  if (!secret) throw new Error('Cannot derive JWT — set GROQ_API_KEY or AUTH_JWT_SECRET');

  const installId = process.env.INSTALL_ID?.trim() || crypto.randomUUID();
  const res = await fetch(`${baseUrl}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      install_id: installId,
      package_name: packageName,
      cert_sha256: certSha256,
      app_version: 'benchmark-script',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const payload = await res.json();
  return payload.access_token;
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
      previous_scripts: [],
    }),
    signal: AbortSignal.timeout(90000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Story API ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

async function main() {
  console.log('Benchmark BFF:', baseUrl);
  const token = await fetchAuthToken();

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < TRACKS.length; i++) {
    const track = TRACKS[i];
    const label = `${track.artist} — ${track.title}`;
    process.stdout.write(`\n=== [${i + 1}/${TRACKS.length}] ${label} ===\n`);
    if (i > 0 && DELAY_MS > 0) {
      process.stdout.write(`(waiting ${DELAY_MS / 1000}s for rate limit…)\n`);
      await sleep(DELAY_MS);
    }
    try {
      const data = await fetchStory(token, track);
      if (data.demo) {
        failed++;
        failures.push({ label, reason: 'demo fallback (backend/Groq failed)' });
        console.log('FAIL: demo fallback');
        console.log(data.script?.slice(0, 300));
        continue;
      }

      const q = validateStoryScript(data.script, '30s', track.artist, track.title);
      if (q.ok) {
        passed++;
        console.log(`OK (${data.word_count ?? '?'} words, voice=${data.voiceId ?? '?'})`);
        console.log(data.script);
      } else {
        failed++;
        failures.push({ label, reason: q.reason, script: data.script });
        console.log(`QUALITY FAIL: ${q.reason}`);
        console.log(data.script);
      }
    } catch (e) {
      failed++;
      failures.push({ label, reason: e.message });
      console.log(`ERROR: ${e.message}`);
    }
  }

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Passed: ${passed}/${TRACKS.length}`);
  console.log(`Failed: ${failed}/${TRACKS.length}`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`- ${f.label}: ${f.reason}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
