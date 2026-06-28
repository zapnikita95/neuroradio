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
import { isTelegramAdminNotifyConfigured, sendTelegramAdminMessage } from '../services/telegram-admin-notify.js';

const router = Router();

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

export default router;
