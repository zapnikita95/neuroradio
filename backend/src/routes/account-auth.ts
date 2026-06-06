import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import {
  getAccountProfile,
  getSyncStatus,
  linkTelegramAccount,
  startEmailLogin,
  verifyEmailLogin,
} from '../services/account-store.js';
import { verifyTelegramLogin, type TelegramAuthPayload } from '../services/telegram-auth.js';
import { isEmailConfigured } from '../services/email-sender.js';
import { isTelegramBotConfigured } from '../services/telegram-bot-poller.js';
import {
  checkTelegramMobileLogin,
  startTelegramMobileLogin,
} from '../services/telegram-mobile-auth.js';

const router = Router();

router.use(requireAppAuth);

router.get('/config', (_req: Request, res: Response) => {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? null;
  res.json({
    emailEnabled: isEmailConfigured(),
    telegramEnabled: isTelegramBotConfigured(),
    telegramBotUsername: botUsername,
  });
});

router.get('/profile', (req: Request, res: Response) => {
  const installId = req.installId!;
  const sync = getSyncStatus(installId);
  const profile = getAccountProfile(installId);
  res.json({ ...sync, ...profile });
});

router.post('/email/start', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const result = startEmailLogin(req.installId!, email);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, expiresInSec: result.expiresInSec });
});

router.post('/email/verify', (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const result = verifyEmailLogin(req.installId!, email, code);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, accountId: result.accountId, profile: getAccountProfile(req.installId!) });
});

/** Movie Planner-style: open t.me/bot?start=mobileauth_<code>, bot confirms, app polls. */
router.post('/telegram-mobile/start', (req: Request, res: Response) => {
  if (!isTelegramBotConfigured()) {
    res.status(503).json({ error: 'Telegram bot не настроен (TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME)' });
    return;
  }
  const started = startTelegramMobileLogin(req.installId!);
  res.json({
    ok: true,
    code: started.code,
    deep_link: started.deepLink,
    expiresInSec: started.expiresInSec,
  });
});

router.post('/telegram-mobile/check', (req: Request, res: Response) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!code.trim()) {
    res.status(400).json({ error: 'code required' });
    return;
  }
  const result = checkTelegramMobileLogin(req.installId!, code);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  if ('verified' in result && result.verified === false) {
    res.json({ ok: true, verified: false });
    return;
  }
  if ('accountId' in result) {
    res.json({
      ok: true,
      verified: true,
      accountId: result.accountId,
      profile: result.profile,
    });
    return;
  }
  res.json({ ok: true, verified: false });
});

/** Legacy Login Widget verify (web). Android uses telegram-mobile flow. */
router.post('/telegram', (req: Request, res: Response) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    res.status(503).json({ error: 'Telegram login не настроен (TELEGRAM_BOT_TOKEN)' });
    return;
  }

  const body = req.body as TelegramAuthPayload;
  if (!body?.id || !body.hash || !body.auth_date) {
    res.status(400).json({ error: 'Invalid Telegram payload' });
    return;
  }

  if (!verifyTelegramLogin(body, botToken)) {
    res.status(403).json({ error: 'Telegram signature invalid' });
    return;
  }

  const result = linkTelegramAccount(req.installId!, body.id, body.username);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, accountId: result.accountId, profile: getAccountProfile(req.installId!) });
});

export default router;
