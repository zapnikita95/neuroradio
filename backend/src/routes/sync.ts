import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import {
  createAccount,
  getSyncStatus,
  linkAccount,
  pullHistoryAsync,
  pullSettings,
  pushHistoryAsync,
  pushSettings,
  resolveAccountId,
  type SyncHistoryEntry,
  type SyncSettings,
} from '../services/account-store.js';
import {
  pgInsertScrobbleHistory,
  pgListScrobbleHistory,
  type SyncScrobbleEntry,
} from '../services/scrobble-history-store.js';

const router = Router();

router.use(requireAppAuth);

router.get('/status', (req: Request, res: Response) => {
  const installId = req.installId!;
  res.json(getSyncStatus(installId));
});

router.post('/create', (req: Request, res: Response) => {
  const installId = req.installId!;
  const status = getSyncStatus(installId);
  if (status.linked) {
    res.json({
      accountId: status.accountId,
      syncCode: status.syncCode,
      alreadyLinked: true,
    });
    return;
  }
  const created = createAccount(installId);
  res.json({ ...created, alreadyLinked: false });
});

router.post('/link', async (req: Request, res: Response) => {
  const installId = req.installId!;
  const syncCode = typeof req.body?.sync_code === 'string' ? req.body.sync_code : '';
  if (!syncCode.trim()) {
    res.status(400).json({ error: 'sync_code required' });
    return;
  }

  const result = linkAccount(installId, syncCode);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }

  const history = (await pullHistoryAsync(installId, 0)) ?? result.history;

  res.json({
    accountId: result.accountId,
    settings: result.settings,
    history,
  });
});

router.get('/settings', (req: Request, res: Response) => {
  const settings = pullSettings(req.installId!);
  if (!settings) {
    res.status(404).json({ error: 'Not linked' });
    return;
  }
  res.json({ settings });
});

router.put('/settings', (req: Request, res: Response) => {
  const body = req.body as SyncSettings;
  const settings = pushSettings(req.installId!, body);
  if (!settings) {
    res.status(404).json({ error: 'Not linked' });
    return;
  }
  res.json({ settings });
});

router.get('/history', async (req: Request, res: Response) => {
  const since = parseInt(String(req.query.since ?? '0'), 10);
  const history = await pullHistoryAsync(req.installId!, Number.isNaN(since) ? 0 : since);
  if (!history) {
    res.status(404).json({ error: 'Not linked' });
    return;
  }
  res.json({ history });
});

router.post('/history', async (req: Request, res: Response) => {
  const entry = req.body as SyncHistoryEntry;
  if (
    !entry?.id ||
    !entry.trackKey ||
    !entry.artist ||
    !entry.title ||
    !entry.script ||
    typeof entry.playedAt !== 'number'
  ) {
    res.status(400).json({ error: 'Invalid history entry' });
    return;
  }

  const installId = req.installId!;
  let history = await pushHistoryAsync(installId, entry);
  if (history.length === 0) {
    createAccount(installId);
    history = await pushHistoryAsync(installId, entry);
  }
  if (history.length === 0) {
    res.status(200).json({ ok: false, skipped: true, reason: 'not_linked' });
    return;
  }
  res.json({ ok: true, history });
});

router.get('/scrobbles', async (req: Request, res: Response) => {
  const since = parseInt(String(req.query.since ?? '0'), 10);
  const installId = req.installId!;
  const accountId = resolveAccountId(installId);
  if (!accountId) {
    res.status(404).json({ error: 'Not linked' });
    return;
  }
  const scrobbles = await pgListScrobbleHistory(
    installId,
    accountId,
    Number.isNaN(since) ? 0 : since,
  );
  res.json({ scrobbles });
});

router.post('/scrobbles', async (req: Request, res: Response) => {
  const entry = req.body as SyncScrobbleEntry;
  if (
    !entry?.id ||
    !entry.artist?.trim() ||
    !entry.title?.trim() ||
    typeof entry.scrobbledAt !== 'number'
  ) {
    res.status(400).json({ error: 'Invalid scrobble entry' });
    return;
  }

  const installId = req.installId!;
  let accountId = resolveAccountId(installId);
  if (!accountId) {
    createAccount(installId);
    accountId = resolveAccountId(installId);
  }
  if (!accountId) {
    res.status(200).json({ ok: false, skipped: true, reason: 'not_linked' });
    return;
  }

  await pgInsertScrobbleHistory(installId, accountId, entry);
  res.json({ ok: true });
});

export default router;
