/**
 * Test Groq via backend proxy (local or Railway).
 * Usage:
 *   node scripts/test-proxy.mjs
 *   RAILWAY_URL=https://xxx.up.railway.app node scripts/test-proxy.mjs
 */
import 'dotenv/config';

const baseUrl = (process.env.RAILWAY_URL || 'http://localhost:3000').replace(/\/$/, '');
const secret = process.env.PROXY_SECRET?.trim() ?? '';

const headers = {
  'Content-Type': 'application/json',
  ...(secret ? { 'X-Music-Story-Secret': secret } : {}),
};

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 500) };
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 800) };
}

console.log('Base URL:', baseUrl);
console.log('Secret:', secret ? `${secret.slice(0, 6)}…` : '(none)');
console.log('');

console.log('=== GET /health ===');
console.log(await get('/health'));
console.log('');

console.log('=== POST /v1/groq/chat/completions (proxy) ===');
const groq = await post('/v1/groq/chat/completions', {
  model: 'llama-3.3-70b-versatile',
  max_tokens: 40,
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'user',
      content:
        'Ответь JSON: {"script":"Слушай братуха, прокси работает.","word_count":4}',
    },
  ],
});
console.log('status:', groq.status);
try {
  const parsed = JSON.parse(groq.body);
  const content = parsed.choices?.[0]?.message?.content;
  console.log('groq content:', content?.slice(0, 200) ?? groq.body);
} catch {
  console.log('body:', groq.body);
}
console.log('');

console.log('=== POST /v1/story/full ===');
const story = await post('/v1/story/full', {
  artist: 'Miles Davis',
  title: 'So What',
  previous_scripts: [],
});
console.log('status:', story.status);
try {
  const parsed = JSON.parse(story.body);
  console.log('demo:', parsed.demo);
  console.log('sources:', parsed.sources);
  console.log('script:', parsed.script?.slice(0, 180) + '…');
  console.log('audioUrl:', parsed.audioUrl ?? 'null');
} catch {
  console.log('body:', story.body);
}
