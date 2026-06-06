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

function telegramBotUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? null;
}

function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && telegramBotUsername());
}

const router = Router();

router.use(requireAppAuth);

router.get('/config', (_req: Request, res: Response) => {
  const widgetBase = process.env.TELEGRAM_WIDGET_BASE_URL?.trim().replace(/\/$/, '') ?? null;
  res.json({
    emailEnabled: isEmailConfigured(),
    telegramEnabled: isTelegramConfigured(),
    telegramBotUsername: telegramBotUsername(),
    telegramWidgetBaseUrl: widgetBase,
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

/** Telegram Login Widget — hash verified server-side (WebView in app, baseUrl = TELEGRAM_WIDGET_BASE_URL). */
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
