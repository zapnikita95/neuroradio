#!/usr/bin/env node
/**
 * Local HTTP agent for Harvest Dashboard buttons.
 * Listens on 127.0.0.1 — dashboard on efir-ai.ru calls localhost (loopback exempt from mixed content).
 *
 *   cd backend && npm run seed:agent
 */
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(__dir, '..');
const LOG_DIR = join(BACKEND, 'logs');
const PID_FILE = join(LOG_DIR, 'bulk-seed.pid');
const LOG_FILE = join(LOG_DIR, 'bulk-seed.log');
const ERR_FILE = join(LOG_DIR, 'bulk-seed.err.log');
const PORT = parseInt(process.env.HARVEST_LOCAL_AGENT_PORT ?? '17842', 10);

const ALLOW_ORIGINS = new Set([
  'https://www.efir-ai.ru',
  'https://efir-ai.ru',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
]);

function corsHeaders(origin, req) {
  const o = origin && ALLOW_ORIGINS.has(origin) ? origin : '*';
  const headers = {
    'access-control-allow-origin': o,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': req?.headers?.['access-control-request-headers'] ?? 'content-type',
    // Chrome: https://efir-ai.ru → 127.0.0.1 requires Private Network Access
    'access-control-allow-private-network': 'true',
  };
  return headers;
}

function json(res, status, body, origin, req) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin, req) });
  res.end(payload);
}

async function isBulkSeedRunning() {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*bulk-seed-fact-bank.mjs*' } | Select-Object -ExpandProperty ProcessId",
        ],
        { timeout: 8000 },
      );
      const pids = stdout
        .trim()
        .split(/\s+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      return pids.length ? pids : null;
    } catch {
      /* fall through */
    }
  }
  if (existsSync(PID_FILE)) {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        return [pid];
      } catch {
        return null;
      }
    }
  }
  return null;
}

function tailFile(path, maxLines = 8) {
  try {
    if (!existsSync(path)) return [];
    const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

async function startBulkSeedDetached() {
  const running = await isBulkSeedRunning();
  if (running?.length) {
    return { ok: true, alreadyRunning: true, pids: running };
  }

  if (process.platform === 'win32') {
    const ps1 = join(__dir, 'run-bulk-seed-detached.ps1');
    await execFileAsync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { cwd: BACKEND, timeout: 120_000 },
    );
  } else {
    spawn('node', ['scripts/bulk-seed-fact-bank.mjs', '--hot-push', '--target=120000', '--hot-target=20000', '--concurrency=5', '--resume', '--no-backfill-lastfm'], {
      cwd: BACKEND,
      detached: true,
      stdio: 'ignore',
    }).unref();
  }

  await new Promise((r) => setTimeout(r, 1500));
  const pids = await isBulkSeedRunning();
  return { ok: true, started: Boolean(pids?.length), pids: pids ?? [] };
}

async function startYoutubeFromQueue() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npm, ['run', 'harvest:youtube-from-queue'], {
    cwd: BACKEND,
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  child.unref();
  return { ok: true, pid: child.pid };
}

async function startYoutubeRetry() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npm, ['run', 'harvest:youtube-retry'], {
    cwd: BACKEND,
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  child.unref();
  return { ok: true, pid: child.pid };
}

async function handle(req, res) {
  const origin = req.headers.origin ?? '';
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin, req));
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'harvest-local-agent', port: PORT }, origin, req);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/status') {
    const bulkPids = await isBulkSeedRunning();
    let logMtime;
    try {
      if (existsSync(LOG_FILE)) logMtime = statSync(LOG_FILE).mtime.toISOString();
    } catch {
      /* ignore */
    }
    json(
      res,
      200,
      {
        ok: true,
        bulkSeed: { running: Boolean(bulkPids?.length), pids: bulkPids ?? [] },
        logTail: tailFile(LOG_FILE, 6),
        errTail: tailFile(ERR_FILE, 4),
        logMtime,
      },
      origin,
      req,
    );
    return;
  }

  if (req.method === 'POST' && url.pathname === '/start/bulk-seed') {
    try {
      const result = await startBulkSeedDetached();
      json(res, 200, result, origin, req);
    } catch (e) {
      json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) }, origin, req);
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/start/youtube-queue') {
    try {
      const result = await startYoutubeFromQueue();
      json(res, 200, result, origin, req);
    } catch (e) {
      json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) }, origin, req);
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/start/youtube-retry') {
    try {
      const result = await startYoutubeRetry();
      json(res, 200, result, origin, req);
    } catch (e) {
      json(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) }, origin, req);
    }
    return;
  }

  json(res, 404, { error: 'not_found' }, origin, req);
}

const server = createServer((req, res) => {
  handle(req, res).catch((e) => {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) }, req.headers.origin ?? '', req);
  });
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.log(`Агент уже работает → http://127.0.0.1:${PORT}/health`);
    console.log('Не запускай второй раз. Обнови harvest.html в браузере.');
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Harvest local agent → http://127.0.0.1:${PORT}`);
  console.log('  GET  /health  /status');
  console.log('  POST /start/bulk-seed  /start/youtube-queue  /start/youtube-retry');
  console.log('Dashboard: https://www.efir-ai.ru/admin/harvest.html');
});
