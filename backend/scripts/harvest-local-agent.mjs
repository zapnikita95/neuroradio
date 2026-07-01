#!/usr/bin/env node
/**
 * Local harvest agent: polls Railway for commands, runs jobs on this PC.
 * Web dashboard → Railway queue → this agent (no browser→localhost).
 *
 *   Set-Location "...\backend"; npm run seed:agent
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:http';
import os from 'node:os';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const execAsync = promisify(execFile);
const __dir = dirname(fileURLToPath(import.meta.url));
const BACKEND = join(__dir, '..');
const LOG_DIR = join(BACKEND, 'logs');
const PID_FILE = join(LOG_DIR, 'bulk-seed.pid');
const LOG_FILE = join(LOG_DIR, 'bulk-seed.log');
const ERR_FILE = join(LOG_DIR, 'bulk-seed.err.log');
const YT_LOG_FILE = join(LOG_DIR, 'youtube-harvest.log');
const YT_ERR_FILE = join(LOG_DIR, 'youtube-harvest.err.log');
const SYNC_LOG_FILE = join(LOG_DIR, 'harvest-sync.log');
const PORT = parseInt(process.env.HARVEST_LOCAL_AGENT_PORT ?? '17842', 10);
const POLL_MS = parseInt(process.env.HARVEST_AGENT_POLL_MS ?? '4000', 10);

function bffBase() {
  return (
    process.env.WEBSITE_DEMO_API_BASE?.trim() ||
    process.env.BFF_URL?.trim() ||
    process.env.PUBLIC_BFF_URL?.trim() ||
    'https://music-story-production.up.railway.app'
  ).replace(/\/$/, '');
}

function dashboardToken() {
  return process.env.HARVEST_DASHBOARD_TOKEN?.trim() ?? '';
}

async function railwayFetch(path, opts = {}) {
  const token = dashboardToken();
  if (!token) {
    console.warn('[agent] HARVEST_DASHBOARD_TOKEN missing — Railway poll disabled');
    return null;
  }
  const url = `${bffBase()}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      'x-harvest-dashboard-token': token,
      ...(opts.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
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
    return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch {
    return [];
  }
}

async function startBulkSeedDetached() {
  const running = await isBulkSeedRunning();
  if (running?.length) return { ok: true, alreadyRunning: true, pids: running };

  if (process.platform === 'win32') {
    const ps1 = join(__dir, 'run-bulk-seed-detached.ps1');
    await execFileAsync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
      { cwd: BACKEND, timeout: 120_000 },
    );
  } else {
    spawn(
      'node',
      [
        'scripts/bulk-seed-fact-bank.mjs',
        '--hot-push',
        '--target=120000',
        '--hot-target=20000',
        '--concurrency=5',
        '--resume',
        '--no-backfill-lastfm',
      ],
      { cwd: BACKEND, detached: true, stdio: 'ignore' },
    ).unref();
  }
  await new Promise((r) => setTimeout(r, 1500));
  const pids = await isBulkSeedRunning();
  return { ok: true, started: Boolean(pids?.length), pids: pids ?? [] };
}

async function isYoutubeHarvestRunning() {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*youtube-harvest-batch.mjs*' } | Select-Object -ExpandProperty ProcessId",
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
      return null;
    }
  }
  return null;
}

async function startYoutubeHarvestDetached(mode) {
  const running = await isYoutubeHarvestRunning();
  if (running?.length) return { ok: true, alreadyRunning: true, pids: running, mode };

  if (process.platform === 'win32') {
    const ps1 = join(__dir, 'run-youtube-harvest-detached.ps1');
    await execFileAsync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Mode', mode],
      { cwd: BACKEND, timeout: 120_000 },
    );
  } else {
    const batchArg = mode === 'retry' ? '--retry-only' : '--from-queue';
    spawn('node', ['scripts/youtube-harvest-batch.mjs', batchArg], {
      cwd: BACKEND,
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
  await new Promise((r) => setTimeout(r, 1500));
  const pids = await isYoutubeHarvestRunning();
  return { ok: true, started: Boolean(pids?.length), pids: pids ?? [], mode, log: YT_LOG_FILE };
}

async function runSyncDashboard() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const shell = process.platform === 'win32';
  await execAsync(npm, ['run', 'build'], { cwd: BACKEND, timeout: 180_000, shell });
  await execAsync('node', ['scripts/bulk-seed-publish-dashboard.mjs'], {
    cwd: BACKEND,
    timeout: 120_000,
    shell,
  });
  await execAsync('node', ['scripts/youtube-harvest-publish-dashboard.mjs'], {
    cwd: BACKEND,
    timeout: 180_000,
    shell,
  });
  return { ok: true, synced: true, log: SYNC_LOG_FILE };
}

let lastAutoSyncAt = 0;
async function maybeAutoSyncWhileRunning() {
  if (!dashboardToken()) return;
  const bulk = await isBulkSeedRunning();
  const yt = await isYoutubeHarvestRunning();
  if (!bulk?.length && !yt?.length) return;
  const now = Date.now();
  if (now - lastAutoSyncAt < 45_000) return;
  lastAutoSyncAt = now;
  try {
    console.log('[agent] auto sync snapshot (bulk/yt running)');
    await runSyncDashboard();
  } catch (e) {
    console.warn('[agent] auto sync failed:', e instanceof Error ? e.message : e);
  }
}

async function runCommand(action) {
  if (action === 'bulk-seed') return startBulkSeedDetached();
  if (action === 'youtube-queue') return startYoutubeHarvestDetached('from-queue');
  if (action === 'youtube-retry') return startYoutubeHarvestDetached('retry');
  if (action === 'sync-dashboard') return runSyncDashboard();
  throw new Error(`unknown action: ${action}`);
}

async function pollRailwayCommands() {
  try {
    const data = await railwayFetch(
      `/v1/admin/harvest-agent/poll?pid=${process.pid}&v=2`,
    );
    if (!data?.commands?.length) return;
    for (const cmd of data.commands) {
      console.log(`[agent] run ${cmd.action} (${cmd.id})`);
      try {
        const result = await runCommand(cmd.action);
        await railwayFetch('/v1/admin/harvest-agent/ack', {
          method: 'POST',
          body: JSON.stringify({ id: cmd.id, ok: true, result: JSON.stringify(result) }),
        });
        console.log(`[agent] done ${cmd.action}`, result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[agent] fail ${cmd.action}:`, msg);
        await railwayFetch('/v1/admin/harvest-agent/ack', {
          method: 'POST',
          body: JSON.stringify({ id: cmd.id, ok: false, result: msg }),
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.warn('[agent] poll:', e instanceof Error ? e.message : e);
  }
  await maybeAutoSyncWhileRunning();
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-private-network': 'true',
  };
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders() });
  res.end(JSON.stringify(body));
}

async function handleLocalHttp(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, {
      ok: true,
      service: 'harvest-local-agent',
      port: PORT,
      bff: bffBase(),
      token: Boolean(dashboardToken()),
      hostname: os.hostname(),
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/status') {
    const bulkPids = await isBulkSeedRunning();
    json(res, 200, {
      ok: true,
      bulkSeed: { running: Boolean(bulkPids?.length), pids: bulkPids ?? [] },
      railway: bffBase(),
      pollMs: POLL_MS,
    });
    return;
  }
  json(res, 404, { error: 'not_found' });
}

const server = createServer((req, res) => {
  handleLocalHttp(req, res).catch((e) => {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  });
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.log(`Агент уже работает → http://127.0.0.1:${PORT}/health`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Harvest agent → poll Railway every ${POLL_MS}ms`);
  console.log(`  BFF: ${bffBase()}`);
  console.log(`  token: ${dashboardToken() ? 'ok' : 'MISSING — add HARVEST_DASHBOARD_TOKEN to backend/.env'}`);
  console.log(`  health: http://127.0.0.1:${PORT}/health`);
  void pollRailwayCommands();
  setInterval(() => void pollRailwayCommands(), POLL_MS);
});
