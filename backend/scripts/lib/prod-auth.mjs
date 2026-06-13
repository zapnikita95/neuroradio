/** Shared JWT for prod smoke scripts (debug cert). */
export const BFF_URL = (process.env.BFF_URL ?? 'https://www.efir-ai.ru').replace(/\/$/, '');
export const DEBUG_CERT =
  'a0105c5f4b340597d107f440356ffc9fcfa8c3fbdf002646a67d0a4ed733a8fc';
export const TEST_INSTALL_ID = '00000000-0000-4000-8000-0000000000ab';

export async function fetchProdToken(installId = TEST_INSTALL_ID) {
  const authRes = await fetch(`${BFF_URL}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      package_name: 'com.efirai.myapp',
      cert_sha256: DEBUG_CERT,
      install_id: installId,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!authRes.ok) {
    throw new Error(`auth failed ${authRes.status}: ${await authRes.text()}`);
  }
  const { access_token } = await authRes.json();
  return access_token;
}

export async function fetchProdHealth() {
  const res = await fetch(`${BFF_URL}/health`, { signal: AbortSignal.timeout(15_000) });
  return res.json();
}

export async function postProdStoryFull(
  token,
  { artist, title, voiceId = 'filipp', storyLength = '30s', llmProvider = 'openrouter', openRouterApiKey },
) {
  const body = {
    artist,
    title,
    voice_id: voiceId,
    story_length: storyLength,
    language: 'ru',
    llm_provider: llmProvider,
  };
  if (openRouterApiKey?.trim()) {
    body.openrouter_api_key = openRouterApiKey.trim();
  }

  const t0 = Date.now();
  const storyRes = await fetch(`${BFF_URL}/v1/story/full`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const elapsedMs = Date.now() - t0;
  const bodyText = await storyRes.text();
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { ok: false, status: storyRes.status, elapsedMs, error: 'not JSON', raw: bodyText.slice(0, 500) };
  }
  if (!storyRes.ok) {
    return {
      ok: false,
      status: storyRes.status,
      elapsedMs,
      error: parsed.error ?? parsed.message ?? `HTTP ${storyRes.status}`,
      body: parsed,
    };
  }
  return {
    ok: true,
    status: storyRes.status,
    elapsedMs,
    seed: (parsed.seed_fact ?? parsed.seedFact ?? '').trim(),
    scope: parsed.seed_scope ?? parsed.seedScope ?? '',
    interest: parsed.seed_interest_rating ?? parsed.seedInterestRating ?? '',
    words: parsed.word_count ?? parsed.wordCount ?? '',
    script: (parsed.script ?? '').trim(),
    audioUrl: parsed.audioUrl ?? parsed.audio_url ?? '',
    body: parsed,
  };
}
