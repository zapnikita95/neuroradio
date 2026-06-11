import { Router, Request, Response } from 'express';
import { requireAppAuth } from '../middleware/app-auth.js';
import {
  claimDeviceWelcomeTrial,
  getAccountProfileLoaded,
  getSyncStatus,
  linkAppleAccount,
  linkTelegramAccount,
  pullAccountCloudData,
  startEmailLogin,
  verifyEmailLogin,
} from '../services/account-store.js';
import { verifyAppleIdentityToken } from '../services/apple-sign-in.js';
import { verifyTelegramLogin, type TelegramAuthPayload } from '../services/telegram-auth.js';
import { getPublicAuthConfig } from '../services/auth-config.js';

const router = Router();

router.use(requireAppAuth);

router.get('/config', (_req: Request, res: Response) => {
  res.json(getPublicAuthConfig());
});

router.get('/profile', async (req: Request, res: Response) => {
  const installId = req.installId!;
  const sync = getSyncStatus(installId);
  const profile = await getAccountProfileLoaded(installId);
  const cloud = profile.email || profile.telegramId ? await pullAccountCloudData(installId) : null;
  res.json({
    ...sync,
    ...profile,
    history: cloud?.history ?? [],
    scrobbles: cloud?.scrobbles ?? [],
  });
});

router.post('/email/start', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const result = await startEmailLogin(req.installId!, email);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, expiresInSec: result.expiresInSec });
});

router.post('/welcome-device', async (req: Request, res: Response) => {
  const deviceFingerprint =
    typeof req.body?.device_fingerprint === 'string' ? req.body.device_fingerprint : '';
  const result = await claimDeviceWelcomeTrial(req.installId!, deviceFingerprint);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({
    ok: true,
    granted: result.granted,
    trialUntil: result.trialUntil,
    entitlement: result.entitlement,
  });
});

router.post('/email/verify', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const deviceFingerprint =
    typeof req.body?.device_fingerprint === 'string' ? req.body.device_fingerprint : undefined;
  const result = await verifyEmailLogin(req.installId!, email, code, deviceFingerprint);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  const cloud = await pullAccountCloudData(req.installId!);
  const profile = await getAccountProfileLoaded(req.installId!);
  res.json({
    ok: true,
    accountId: result.accountId,
    profile,
    history: cloud?.history ?? [],
    scrobbles: cloud?.scrobbles ?? [],
  });
});

/** Sign in with Apple — identity token verified server-side (Guideline 4.8). */
router.post('/apple', async (req: Request, res: Response) => {
  const identityToken =
    typeof req.body?.identityToken === 'string' ? req.body.identityToken.trim() : '';
  if (!identityToken) {
    res.status(400).json({ error: 'Missing Apple identity token' });
    return;
  }

  const verified = await verifyAppleIdentityToken(identityToken);
  if (!verified.ok) {
    res.status(403).json({ error: verified.error });
    return;
  }

  const email =
    typeof req.body?.email === 'string' && req.body.email.trim()
      ? req.body.email.trim()
      : verified.claims.email;

  const result = linkAppleAccount(req.installId!, verified.claims.sub, email);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  const cloud = await pullAccountCloudData(req.installId!);
  const profile = await getAccountProfileLoaded(req.installId!);
  res.json({
    ok: true,
    accountId: result.accountId,
    profile,
    history: cloud?.history ?? [],
    scrobbles: cloud?.scrobbles ?? [],
  });
});

/** Telegram Login Widget — hash verified server-side (WebView in app, baseUrl = TELEGRAM_WIDGET_BASE_URL). */
router.post('/telegram', async (req: Request, res: Response) => {
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

  const deviceFingerprint =
    typeof req.body?.device_fingerprint === 'string' ? req.body.device_fingerprint : undefined;
  const result = linkTelegramAccount(req.installId!, body.id, body.username, deviceFingerprint);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  const cloud = await pullAccountCloudData(req.installId!);
  const profile = await getAccountProfileLoaded(req.installId!);
  res.json({
    ok: true,
    accountId: result.accountId,
    profile,
    history: cloud?.history ?? [],
    scrobbles: cloud?.scrobbles ?? [],
  });
});

export default router;
