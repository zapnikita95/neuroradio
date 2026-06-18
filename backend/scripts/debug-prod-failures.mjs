#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');
for (const p of [resolve(root, '..', '.env'), resolve(root, '.env')]) {
  if (!existsSync(p)) continue;
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

const { fetchProdToken, postProdStoryFull, testInstallId } = await import('./lib/prod-auth.mjs');

const cases = [
  ['Кино', 'Группа крови', 'radio_host'],
  ['Dolly Parton', 'I Will Always Love You', 'radio_host'],
  ['Adele', 'Easy On Me', 'night_dj'],
];

for (let i = 0; i < cases.length; i += 1) {
  const [artist, title, narrator] = cases[i];
  const installId = testInstallId(3000 + i);
  const token = await fetchProdToken(installId);
  const r = await postProdStoryFull(token, {
    artist,
    title,
    narrator,
    openRouterApiKey: process.env.OPEN_ROUTER_API_KEY?.trim(),
  });
  console.log(
    JSON.stringify({
      artist,
      title,
      ok: r.ok,
      status: r.status,
      code: r.code,
      error: r.error,
      message: r.message,
      ms: r.elapsedMs,
      seed: (r.seed || '').slice(0, 120),
    }),
  );
}
