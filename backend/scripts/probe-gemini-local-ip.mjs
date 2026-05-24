/**
 * Probe Gemini from this machine's IP (not Railway).
 * Run: node scripts/probe-gemini-local-ip.mjs
 */
import 'dotenv/config';

const key = process.env.GEMINI_API_KEY?.trim();
if (!key) {
  console.error('GEMINI_API_KEY missing in backend/.env');
  process.exit(1);
}

const models = [
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

function extractMessage(body) {
  try {
    const j = JSON.parse(body);
    return j.error?.message ?? null;
  } catch {
    const m = body.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/);
    return m?.[1]?.replace(/\\"/g, '"') ?? body.slice(0, 160);
  }
}

async function probe(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Say ok in one word.' }] }],
      generationConfig: { maxOutputTokens: 16, temperature: 0 },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.text();
  const ms = Date.now() - t0;

  if (res.ok) {
    const j = JSON.parse(body);
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    console.log(`OK   ${model}  ${ms}ms  ->  ${JSON.stringify(text)}`);
    return;
  }

  console.log(`FAIL ${model}  HTTP ${res.status}  ${ms}ms`);
  console.log(`     ${extractMessage(body)}`);
}

console.log(`Probe from local IP (not Railway). Key prefix: ${key.slice(0, 8)}…\n`);
for (const model of models) {
  await probe(model);
}
