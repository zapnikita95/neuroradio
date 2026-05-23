/**
 * Test backend security (JWT + story/full only; Groq proxy removed).
 */
import 'dotenv/config';
import crypto from 'node:crypto';

const baseUrl = (process.env.RAILWAY_URL || 'http://localhost:3000').replace(/\/$/, '');
const packageName = process.env.ALLOWED_PACKAGE_NAME?.trim() || 'com.musicstory.app';
const certSha256 =
  (process.env.ALLOWED_CERT_SHA256?.split(',')[0] ??
    'a0105c5f4b340597d1f07f440356ffc9fcfca8c3fbdf002646a67d0a4ed733a8fc')
    .trim()
    .replace(/:/g, '')
    .toLowerCase();

function resolveJwtSecret() {
  const explicit = process.env.AUTH_JWT_SECRET?.trim();
  if (explicit && explicit.length >= 32) return explicit;
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) return null;
  return crypto.createHmac('sha256', 'music-story-app-jwt-v1').update(groqKey).digest('hex');
}

async function fetchAuthToken() {
  if (!resolveJwtSecret()) return null;

  const installId = process.env.INSTALL_ID?.trim() || crypto.randomUUID();
  const res = await fetch(`${baseUrl}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      install_id: installId,
      package_name: packageName,
      cert_sha256: certSha256,
      app_version: 'test-script',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const payload = await res.json();
  return payload.access_token ?? null;
}

async function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = await fetchAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function post(path, body, headers) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 800) };
}

console.log('Base URL:', baseUrl);
const headers = await buildHeaders();

console.log('=== POST /v1/story/full ===');
const story = await post(
  '/v1/story/full',
  { artist: 'Miles Davis', title: 'So What', previous_scripts: [] },
  headers,
);
console.log('status:', story.status);
try {
  const parsed = JSON.parse(story.body);
  console.log('demo:', parsed.demo);
  console.log('audioUrl:', parsed.audioUrl ?? 'null');
  console.log('script:', parsed.script?.slice(0, 180) + '…');
} catch {
  console.log('body:', story.body);
}

console.log('');
console.log('=== Groq proxy should be gone (expect 404) ===');
const blocked = await post('/v1/groq/chat/completions', { model: 'x' }, headers);
console.log('status:', blocked.status);
