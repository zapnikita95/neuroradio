/**
 * Load env from repo root and backend/ (later files do not override existing vars).
 * Lets local dev use Music story/.env or .env.example without copying into backend/.env only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(backendRoot, '..');

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let value = t.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const paths = [
  resolve(repoRoot, '.env.example'),
  resolve(repoRoot, '.env'),
  resolve(backendRoot, '.env.example'),
  resolve(backendRoot, '.env'),
];

for (const p of paths) {
  loadEnvFile(p);
}

/** Never throttle live /v1/story/full from a stray Railway env var — bulk scripts set BULK_HARVEST too. */
if (
  process.env.HARVEST_RATE_LIMIT?.trim().toLowerCase() === 'true' &&
  process.env.BULK_HARVEST?.trim().toLowerCase() !== 'true'
) {
  delete process.env.HARVEST_RATE_LIMIT;
  console.warn('[env] HARVEST_RATE_LIMIT ignored on live BFF (bulk harvest only)');
}

const loaded = paths.filter((p) => existsSync(p));
if (loaded.length > 0) {
  console.log(`[env] loaded from: ${loaded.map((p) => p.replace(repoRoot, '.')).join(', ')}`);
}
