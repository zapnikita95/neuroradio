import 'dotenv/config';

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey) {
  console.error('No GEMINI_API_KEY');
  process.exit(1);
}

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

for (const model of MODELS) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: 'Ответь JSON: {"script":"тест"}' }] }],
    generationConfig: { maxOutputTokens: 64, responseMimeType: 'application/json' },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const raw = await res.text();
    if (res.ok) {
      console.log(`OK ${model}: ${raw.slice(0, 120)}`);
    } else {
      const msg = raw.match(/"message"\s*:\s*"([^"]{0,120})/)?.[1] ?? raw.slice(0, 120);
      console.log(`FAIL ${model} (${res.status}): ${msg}`);
    }
  } catch (e) {
    console.log(`ERR ${model}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
