import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import {
  createAccount,
  getSyncStatus,
  linkAccount,
  pullHistory,
  pullSettings,
  pushHistory,
  pushSettings,
  type SyncHistoryEntry,
  type SyncSettings,
} from '../services/account-store.js';

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

router.post('/link', (req: Request, res: Response) => {
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

  res.json({
    accountId: result.accountId,
    settings: result.settings,
    history: result.history,
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

router.get('/history', (req: Request, res: Response) => {
  const since = parseInt(String(req.query.since ?? '0'), 10);
  const history = pullHistory(req.installId!, Number.isNaN(since) ? 0 : since);
  if (!history) {
    res.status(404).json({ error: 'Not linked' });
    return;
  }
  res.json({ history });
});

router.post('/history', (req: Request, res: Response) => {
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

  const history = pushHistory(req.installId!, entry);
  if (!history) {
    res.status(404).json({ error: 'Not linked' });
    return;
  }
  res.json({ history });
});

export default router;
