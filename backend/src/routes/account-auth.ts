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

const router = Router();

/** Telegram Login Widget page (WebView in Android). Domain must match @BotFather /setdomain. */
router.get('/telegram/widget', (_req: Request, res: Response) => {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim();
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botUsername || !botToken) {
    res.status(503).type('text/html; charset=utf-8').send(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#1a1520;color:#fff;padding:24px">' +
        '<p>Telegram login не настроен на сервере (TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME).</p></body></html>',
    );
    return;
  }

  const safeUsername = botUsername.replace(/[^a-zA-Z0-9_]/g, '');
  res.type('text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Music Story — Telegram</title>
<style>
  body { font-family: system-ui, sans-serif; background: #1a1520; color: #f5efe6; margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; box-sizing: border-box; }
  p { color: #a89bb8; text-align: center; max-width: 320px; line-height: 1.45; }
</style>
</head>
<body>
<p>Войди через Telegram — аккаунт привяжется к этому устройству.</p>
<script>
function onTelegramAuth(user) {
  if (window.MusicStoryAndroid && window.MusicStoryAndroid.onTelegramAuth) {
    window.MusicStoryAndroid.onTelegramAuth(JSON.stringify(user));
  } else {
    document.body.innerHTML = '<p style="color:#f88">Открой эту страницу из приложения Music Story.</p>';
  }
}
</script>
<script async src="https://telegram.org/js/telegram-widget.js?22"
  data-telegram-login="${safeUsername}"
  data-size="large"
  data-onauth="onTelegramAuth(user)"
  data-request-access="write"></script>
</body>
</html>`);
});

router.use(requireAppAuth);

router.get('/config', (_req: Request, res: Response) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim();
  res.json({
    emailEnabled: isEmailConfigured(),
    telegramEnabled: Boolean(botToken && botUsername),
    telegramBotUsername: botUsername ?? null,
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
