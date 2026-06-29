import { Router, type Request, type Response } from 'express';
import { isWeeklyDeepEnrichEnabled } from '../services/weekly-deep-enrich-schedule.js';
import {
  getWeeklyDeepEnrichStatus,
  summarizeWeeklyDeepEnrichQueue,
  persistWeeklyDeepEnrichQueueSnapshot,
  clearWeeklyDeepEnrichProgress,
  restartWeeklyDeepEnrichBatch,
} from '../services/weekly-deep-enrich.js';
import { resolveWeeklyDeepEnrichCap } from '../services/weekly-deep-enrich-schedule.js';
import { triggerWeeklyDeepEnrichNow } from '../services/weekly-deep-enrich-scheduler.js';
import { runEraTop100CatalogUpdate } from '../services/era-top100-catalog.js';
import { countInvalidBankFacts, purgeInvalidBankFacts } from '../services/fact-bank.js';
import { isTelegramAdminNotifyConfigured, sendTelegramAdminMessage } from '../services/telegram-admin-notify.js';
import {
  harvestDashboardTokenFromRequest,
  harvestDashboardTokenOk,
  loadYoutubeHarvestDashboard,
  saveYoutubeHarvestDashboard,
  type YoutubeHarvestDashboard,
} from '../services/youtube-harvest-dashboard.js';
import {
  appendManualQueue,
  clearManualQueue,
  discoverChannelVideos,
  loadHarvestChannels,
  loadHarvestLiveProgress,
  loadManualQueue,
  saveHarvestLiveProgress,
  type HarvestLiveProgress,
  type HarvestManualQueueVideo,
} from '../services/youtube-harvest-admin.js';
import {
  buildBulkSeedDashboardFromFiles,
  loadBulkSeedDashboard,
  saveBulkSeedDashboard,
  saveBulkSeedLiveProgress,
  type BulkSeedDashboard,
  type BulkSeedLiveProgress,
} from '../services/bulk-seed-dashboard.js';

const router = Router();

function harvestAdminOk(req: Request): boolean {
  return harvestDashboardTokenOk(harvestDashboardTokenFromRequest(req));
}

function requireHarvestAdmin(req: Request, res: Response): boolean {
  if (harvestAdminOk(req)) return true;
  res.status(403).json({ error: 'forbidden', hint: 'x-harvest-dashboard-token or ?token=' });
  return false;
}

function adminAuthorized(req: Request): boolean {
  const secret = process.env.BILLING_ADMIN_SECRET?.trim();
  if (!secret) return false;
  const header = req.get('x-billing-admin-secret')?.trim();
  return Boolean(header && header === secret);
}

function requireAdmin(req: Request, res: Response): boolean {
  if (adminAuthorized(req)) return true;
  res.status(403).json({ error: 'forbidden' });
  return false;
}

/** GET /v1/admin/weekly-deep-enrich/status */
router.get('/weekly-deep-enrich/status', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const cap = resolveWeeklyDeepEnrichCap();
  res.json({
    ...getWeeklyDeepEnrichStatus(),
    queue: summarizeWeeklyDeepEnrichQueue(cap),
  });
});

/** POST /v1/admin/weekly-deep-enrich/run  { "forceEra"?: true } */
router.post('/weekly-deep-enrich/run', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!isWeeklyDeepEnrichEnabled()) {
    res.status(400).json({ error: 'WEEKLY_DEEP_ENRICH not enabled' });
    return;
  }
  const forceEra = req.body?.forceEra === true || req.body?.forceEra === 'true';
  if (isTelegramAdminNotifyConfigured()) {
    void sendTelegramAdminMessage(
      `▶️ Weekly deep enrich — ручной старт\nforceEra=${forceEra ? 'да' : 'нет'}`,
    );
  }
  void triggerWeeklyDeepEnrichNow('admin-api', { forceEra });
  res.json({ ok: true, started: true, forceEra });
});

/** POST /v1/admin/weekly-deep-enrich/retry  — clear progress, restart full batch */
router.post('/weekly-deep-enrich/retry', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!isWeeklyDeepEnrichEnabled()) {
    res.status(400).json({ error: 'WEEKLY_DEEP_ENRICH not enabled' });
    return;
  }
  clearWeeklyDeepEnrichProgress();
  if (isTelegramAdminNotifyConfigured()) {
    void sendTelegramAdminMessage('🔄 Weekly deep enrich — полный перезапуск (search fix)');
  }
  restartWeeklyDeepEnrichBatch();
  res.json({ ok: true, restarted: true });
});

/** GET /v1/admin/fact-bank/purge/preview */
router.get('/fact-bank/purge/preview', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const wouldRemove = countInvalidBankFacts();
  res.json({ ok: true, wouldRemove });
});

/** POST /v1/admin/fact-bank/purge */
router.post('/fact-bank/purge', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const wouldRemove = countInvalidBankFacts();
  const removed = purgeInvalidBankFacts();
  if (isTelegramAdminNotifyConfigured() && removed > 0) {
    void sendTelegramAdminMessage(`🧹 Fact bank purge: removed ${removed} junk entries`);
  }
  res.json({ ok: true, wouldRemove, removed });
});

/** POST /v1/admin/era-top100/rebuild */
router.post('/era-top100/rebuild', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const r = await runEraTop100CatalogUpdate();
    persistWeeklyDeepEnrichQueueSnapshot();
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /v1/admin/youtube-harvest/status — token: HARVEST_DASHBOARD_TOKEN */
router.get('/youtube-harvest/status', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  const dash = loadYoutubeHarvestDashboard();
  if (!dash) {
    res.status(404).json({ error: 'no_harvest_data', hint: 'Run batch sync or copy state to volume' });
    return;
  }
  res.json({
    ok: true,
    dashboard: dash,
    live: dash.live ?? loadHarvestLiveProgress(),
    bulkSeed: loadBulkSeedDashboard() ?? buildBulkSeedDashboardFromFiles(),
  });
});

/** POST /v1/admin/youtube-harvest/sync — push dashboard snapshot from local batch */
router.post('/youtube-harvest/sync', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  const body = req.body as YoutubeHarvestDashboard | { dashboard?: YoutubeHarvestDashboard };
  const payload = (body as { dashboard?: YoutubeHarvestDashboard }).dashboard ?? (body as YoutubeHarvestDashboard);
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.videos)) {
    res.status(400).json({ error: 'invalid dashboard payload' });
    return;
  }
  saveYoutubeHarvestDashboard({ ...payload, updatedAt: new Date().toISOString(), source: 'api-sync' });
  res.json({ ok: true, updatedAt: payload.updatedAt, videos: payload.videos.length });
});

/** POST /v1/admin/youtube-harvest/progress — live batch progress from local runner */
router.post('/youtube-harvest/progress', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  const body = req.body as HarvestLiveProgress;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'invalid progress payload' });
    return;
  }
  saveHarvestLiveProgress({ ...body, updatedAt: new Date().toISOString() });
  res.json({ ok: true, status: body.status });
});

/** GET /v1/admin/youtube-harvest/channels */
router.get('/youtube-harvest/channels', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  res.json({ ok: true, channels: loadHarvestChannels() });
});

/** GET /v1/admin/youtube-harvest/discover?channel=middle8&limit=15 */
router.get('/youtube-harvest/discover', async (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  const channel = String(req.query.channel ?? '').trim();
  const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 30);
  if (!channel) {
    res.status(400).json({ error: 'channel query required' });
    return;
  }
  try {
    const videos = await discoverChannelVideos(channel, limit);
    res.json({ ok: true, channel, videos });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** GET /v1/admin/youtube-harvest/queue */
router.get('/youtube-harvest/queue', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  const q = loadManualQueue();
  res.json({ ok: true, ...q });
});

/** POST /v1/admin/youtube-harvest/queue — add videos to manual run queue */
router.post('/youtube-harvest/queue', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  const body = req.body as { videos?: HarvestManualQueueVideo[] };
  const items = Array.isArray(body.videos) ? body.videos : [];
  if (!items.length) {
    res.status(400).json({ error: 'videos array required' });
    return;
  }
  const normalized = items.map((v) => ({
    id: String(v.id ?? '').trim(),
    title: String(v.title ?? v.id).trim(),
    url: String(v.url ?? `https://www.youtube.com/watch?v=${v.id}`).trim(),
    channelName: String(v.channelName ?? '').trim(),
    languageCode: v.languageCode,
    addedBy: 'dashboard',
  })).filter((v) => v.id.length >= 6);
  const videos = appendManualQueue(normalized);
  res.json({ ok: true, queued: normalized.length, total: videos.length, videos });
});

/** DELETE /v1/admin/youtube-harvest/queue */
router.delete('/youtube-harvest/queue', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  clearManualQueue();
  res.json({ ok: true, cleared: true });
});

/** GET /v1/admin/bulk-seed/status */
router.get('/bulk-seed/status', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  const dash = loadBulkSeedDashboard() ?? buildBulkSeedDashboardFromFiles();
  if (!dash) {
    res.status(404).json({ error: 'no_bulk_seed_data', hint: 'Run bulk-seed or sync progress' });
    return;
  }
  res.json({ ok: true, bulkSeed: dash, live: dash.live });
});

/** POST /v1/admin/bulk-seed/sync — push dashboard snapshot from local runner */
router.post('/bulk-seed/sync', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  const body = req.body as BulkSeedDashboard | { bulkSeed?: BulkSeedDashboard };
  const payload = (body as { bulkSeed?: BulkSeedDashboard }).bulkSeed ?? (body as BulkSeedDashboard);
  if (!payload || typeof payload !== 'object' || payload.tracksDone == null) {
    res.status(400).json({ error: 'invalid bulk seed payload' });
    return;
  }
  saveBulkSeedDashboard({ ...payload, updatedAt: new Date().toISOString(), source: 'api-sync' });
  res.json({ ok: true, tracksDone: payload.tracksDone, factsSubstantive: payload.factsSubstantive });
});

/** POST /v1/admin/bulk-seed/progress — live track from local runner */
router.post('/bulk-seed/progress', (req, res) => {
  if (!requireHarvestAdmin(req, res)) return;
  const body = req.body as BulkSeedLiveProgress;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'invalid progress payload' });
    return;
  }
  saveBulkSeedLiveProgress(body);
  res.json({ ok: true, status: body.status });
});

export default router;
