import { Router, Request, Response } from 'express';
import {
  createYooKassaPayment,
  isYooKassaConfigured,
  markPaymentSucceeded,
  parseYooKassaWebhook,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from '../services/yookassa.js';
import { applyYooKassaPaymentSucceeded } from '../services/yookassa-billing.js';
import {
  isEmailConfigured,
  sendPaymentLinkEmail,
  sendSubscribeEmail,
} from '../services/email-sender.js';
import { EDGE_VOICE_PRESETS } from '../services/edge-voices.js';
import { hasYandexCredentials } from '../services/yandex-tts.js';
import { getPublicDownloadLinks, getSiteApkUrl } from '../services/github-downloads.js';
import { getPublicAuthConfig } from '../services/auth-config.js';
import { oauthNativeBridgeHtml, buildTelegramOAuthAuthorizeTarget, oauthAuthorizeRedirectHtml, resolveTelegramOAuthRedirectUri } from '../services/telegram-oidc.js';
import {
  getWebCabinetStatus,
  startWebCabinetCode,
  cancelSubscriptionViaWebCabinet,
  unlinkCardViaWebCabinet,
} from '../services/account-store.js';
import { getChartHarvestStatus } from '../services/weekly-chart-harvest.js';

const router = Router();

/** Latest APK + browser extension URLs (GitHub Releases, cached). */
router.get('/downloads', async (_req: Request, res: Response) => {
  try {
    const links = await getPublicDownloadLinks();
    res.json(links);
  } catch (err) {
    console.warn('[public/downloads]', err instanceof Error ? err.message : err);
    const { getPublicStoreLinks } = await import('../services/store-links.js');
    const store = getPublicStoreLinks();
    res.status(503).json({
      repo: 'zapnikita95/neuroradio',
      tag: null,
      apkUrl: getSiteApkUrl(),
      extensionUrl: null,
      appStoreUrl: store.appStoreUrl,
      googlePlayUrl: store.googlePlayUrl,
      accountUrl: store.accountUrl,
      publishedAt: null,
      error: 'releases_unavailable',
    });
  }
});

/** Login options for app UI — no JWT (shown before /v1/auth/token succeeds). */
router.get('/auth-config', (_req: Request, res: Response) => {
  res.json(getPublicAuthConfig());
});

/** HTTPS redirect target for Telegram OIDC → efirai:// deep link (iOS ASWebAuthenticationSession). */
router.get('/oauth/telegram/callback-bridge', (req: Request, res: Response) => {
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : '';
  console.info('[telegram-oauth] callback-bridge qs_len=%s', qs.length);
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(oauthNativeBridgeHtml(qs));
});

/**
 * Android/Huawei: app opens efir-ai.ru (short URL); HTML JS redirect → oauth.telegram.org with full params.
 * Custom Tabs on some OEMs strip query params on HTTP 302 to oauth.telegram.org.
 */
router.get('/oauth/telegram/authorize', (req: Request, res: Response) => {
  const codeChallenge = String(req.query.code_challenge ?? '').trim();
  const method = String(req.query.code_challenge_method ?? 'S256').trim() || 'S256';
  const target = buildTelegramOAuthAuthorizeTarget(codeChallenge, method);
  if (!target) {
    res.status(400).type('text/plain').send('Invalid code_challenge or OAuth not configured');
    return;
  }
  console.info('[telegram-oauth] authorize html-bridge challenge_len=%s redirect_uri=%s', codeChallenge.length, resolveTelegramOAuthRedirectUri());
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(oauthAuthorizeRedirectHtml(target));
});

/** TTS options for free tier (Edge TTS vs paid SpeechKit). */
router.get('/tts-config', async (_req: Request, res: Response) => {
  res.json({
    freeTier: {
      serverEngine: 'edge',
      speechKitRequiresPaidTier: true,
    },
    edge: {
      enabled: true,
      presets: Object.values(EDGE_VOICE_PRESETS).map((p) => ({
        id: p.id,
        labelRu: p.labelRu,
        descriptionRu: p.descriptionRu,
      })),
    },
    yandex: { configured: hasYandexCredentials() },
  });
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLAN_BY_AMOUNT: Record<string, string> = {
  '199': 'Расширенный · месяц',
  '499': 'Расширенный · квартал',
  '1999': 'Расширенный · год',
};

const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 8;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = hits.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_PER_WINDOW;
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  return (
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown'
  );
}

function parsePlan(raw: unknown): SubscriptionPlan | null {
  if (raw === 'month' || raw === 'quarter' || raw === 'year') return raw;
  const amount =
    typeof raw === 'string' ? raw.replace(/[^\d]/g, '') : typeof raw === 'number' ? String(raw) : '';
  if (amount === '199') return 'month';
  if (amount === '499') return 'quarter';
  if (amount === '1999') return 'year';
  return null;
}

/** Создание платежа YooKassa — возвращает URL для редиректа на оплату. */
router.post('/payment/create', async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const plan = parsePlan(req.body?.plan ?? req.body?.amount);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    res.status(400).json({ error: 'Введите корректный email' });
    return;
  }
  if (!plan) {
    res.status(400).json({ error: 'Выберите тариф' });
    return;
  }

  if (!isYooKassaConfigured()) {
    res.status(503).json({
      error: 'Оплата временно недоступна',
      hint: 'Настройте YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY на сервере',
    });
    return;
  }

  try {
    const localeRaw = typeof req.body?.locale === 'string' ? req.body.locale.trim().toLowerCase() : '';
    const locale = localeRaw === 'en' ? 'en' : localeRaw === 'ru' ? 'ru' : undefined;
    const created = await createYooKassaPayment({ email, plan, locale });
    if (isEmailConfigured()) {
      void sendPaymentLinkEmail({
        to: email,
        plan: created.planLabel,
        amountRub: created.amountRub,
        paymentUrl: created.confirmationUrl,
      }).catch((err) => {
        console.warn('[public/payment] email failed:', err instanceof Error ? err.message : err);
      });
    }
    res.json({
      ok: true,
      paymentId: created.paymentId,
      confirmationUrl: created.confirmationUrl,
      amountRub: created.amountRub,
      plan: created.planLabel,
    });
  } catch (err) {
    console.error('[public/payment/create]', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Не удалось создать платёж, попробуйте позже' });
  }
});

/** Webhook YooKassa — активация подписки по email после успешной оплаты. */
router.post('/yookassa/webhook', async (req: Request, res: Response) => {
  const event = parseYooKassaWebhook(req.body);
  if (!event?.event) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  if (event.event === 'payment.succeeded') {
    const paymentId = event.object?.id?.trim();
    const metaEmail = event.object?.metadata?.email?.trim().toLowerCase();
    const metaPlan = parsePlan(event.object?.metadata?.plan);
    const pending = paymentId ? markPaymentSucceeded(paymentId) : undefined;
    const email = metaEmail || pending?.email;
    const plan = metaPlan || pending?.plan;

    if (email && plan && paymentId) {
      try {
        const metaRecurring =
          event.object?.metadata?.recurring === 'true' || event.object?.metadata?.recurring === true;
        await applyYooKassaPaymentSucceeded({
          paymentId,
          email,
          plan,
          metadataRecurring: metaRecurring,
        });
      } catch (err) {
        console.error('[yookassa/webhook] grant failed:', err instanceof Error ? err.message : err);
      }
    } else {
      console.warn('[yookassa/webhook] payment.succeeded without email/plan metadata');
    }
  }

  res.json({ ok: true });
});

router.get('/yookassa/webhook', (_req, res: Response) => {
  res.json({ ok: true, message: 'YooKassa webhook endpoint active' });
});

/** Код на email для личного кабинета на сайте (отвязка карты ЮKassa). */
router.post('/account/code', async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' });
    return;
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    res.status(400).json({ error: 'Введите корректный email' });
    return;
  }
  const result = await startWebCabinetCode(email);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, expiresInSec: result.expiresInSec });
});

/** Статус подписки в личном кабинете (email + код из письма). */
router.post('/account/status', async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' });
    return;
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const result = await getWebCabinetStatus(email, code);
  if (!result.ok) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ ok: false, error: result.error, code: result.code });
    return;
  }
  res.json({ ok: true, status: result.status });
});

/** Отменить подписку (автопродление) из личного кабинета на сайте. */
router.post('/account/cancel-subscription', async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' });
    return;
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const result = await cancelSubscriptionViaWebCabinet(email, code);
  if (!result.ok) {
    const status = result.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ ok: false, error: result.error, code: result.code });
    return;
  }
  res.json({ ok: true, status: result.status, message: result.message });
});

/** Отвязать карту из личного кабинета на сайте. */
router.post('/account/unlink-card', async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' });
    return;
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const result = await unlinkCardViaWebCabinet(email, code);
  if (!result.ok) {
    const status =
      result.code === 'NOT_FOUND' ? 404 : result.code === 'NO_SAVED_CARD' ? 400 : 400;
    res.status(status).json({ ok: false, error: result.error, code: result.code });
    return;
  }
  res.json({ ok: true, status: result.status, message: result.message });
});

/** Legacy: email-only subscribe (без оплаты) — оставлен для совместимости. */
router.post('/subscribe', async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const amount = typeof req.body?.amount === 'string' ? req.body.amount.replace(/[^\d]/g, '') : '';
  const plan = parsePlan(req.body?.plan ?? amount);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    res.status(400).json({ error: 'Введите корректный email' });
    return;
  }

  const planName = plan ? SUBSCRIPTION_PLANS[plan].labelRu : PLAN_BY_AMOUNT[amount] ?? 'Расширенный';

  if (isYooKassaConfigured() && plan) {
    try {
      const localeRaw = typeof req.body?.locale === 'string' ? req.body.locale.trim().toLowerCase() : '';
      const locale = localeRaw === 'en' ? 'en' : localeRaw === 'ru' ? 'ru' : undefined;
      const created = await createYooKassaPayment({ email, plan, locale });
      if (isEmailConfigured()) {
        await sendPaymentLinkEmail({
          to: email,
          plan: planName,
          amountRub: created.amountRub,
          paymentUrl: created.confirmationUrl,
        });
      }
      res.json({ ok: true, emailed: isEmailConfigured(), confirmationUrl: created.confirmationUrl });
      return;
    } catch (err) {
      console.error('[public/subscribe]', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'Не удалось создать платёж' });
      return;
    }
  }

  if (!isEmailConfigured()) {
    console.warn(`[public/subscribe] Resend not configured — no email sent (${email})`);
    res.json({ ok: true, emailed: false });
    return;
  }

  try {
    await sendSubscribeEmail({ to: email, plan: planName, amount });
    res.json({ ok: true, emailed: true });
  } catch (err) {
    console.error('[public/subscribe] email send failed:', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'Не удалось отправить письмо, попробуйте позже' });
  }
});

/** Offline website demo audio — ElevenLabs via Railway (local RF gets Cloudflare 403). */
router.post('/website-demo/tts', async (req: Request, res: Response) => {
  const secret = String(req.headers['x-website-demo-secret'] ?? '');
  const expected = process.env.WEBSITE_DEMO_SECRET?.trim();
  if (!expected || secret !== expected) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const lang = req.body?.lang === 'en' ? 'en' : 'ru';
  const voiceKey = typeof req.body?.voiceId === 'string' ? req.body.voiceId.trim().toLowerCase() : '';

  if (!text || text.length > 6000) {
    res.status(400).json({ error: 'invalid text' });
    return;
  }

  try {
    if (lang === 'en') {
      const { synthesizeSpeechElevenLabs } = await import('../services/elevenlabs-tts.js');
      const { ELEVENLABS_VOICE_PRESETS } = await import('../services/elevenlabs-voices.js');
      const preset =
        voiceKey && voiceKey in ELEVENLABS_VOICE_PRESETS
          ? ELEVENLABS_VOICE_PRESETS[voiceKey as keyof typeof ELEVENLABS_VOICE_PRESETS]
          : null;
      const voiceId = preset?.voiceId ?? voiceKey;
      const tmp = `web-demo-${Date.now()}.ogg`;
      const result = await synthesizeSpeechElevenLabs(text, tmp, { voiceId });
      const { readFile, unlink } = await import('node:fs/promises');
      const buf = await readFile(result.filePath);
      await unlink(result.filePath).catch(() => undefined);
      res.setHeader('Content-Type', 'audio/ogg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(buf);
      return;
    }

    const { synthesizeSpeech } = await import('../services/yandex-tts.js');
    const tmp = `web-demo-ru-${Date.now()}`;
    const result = await synthesizeSpeech(text, voiceKey || 'zahar', tmp, {
      speed: 1.08,
      artist: 'Michael Jackson',
      title: 'Thriller',
      pauseProfile: 'tight',
      websitePreview: true,
    });
    const { readFile, unlink } = await import('node:fs/promises');
    const buf = await readFile(result.filePath);
    await unlink(result.filePath).catch(() => undefined);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buf);
  } catch (err) {
    console.error('[public/website-demo/tts]', err instanceof Error ? err.message : err);
    res.status(502).json({ error: 'tts_failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

/** Reprocess good_persona likes → style gold corpus (dev / after deploy). */
router.post('/style-corpus/backfill', async (req: Request, res: Response) => {
  const secret = String(req.headers['x-website-demo-secret'] ?? '');
  const expected = process.env.WEBSITE_DEMO_SECRET?.trim();
  if (!expected || secret !== expected) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  try {
    const { hydrateAccountStoreFromPostgres } = await import('../services/account-store.js');
    if (process.env.DATABASE_URL?.trim()) {
      await hydrateAccountStoreFromPostgres();
    }
    const { backfillStyleCorpusFromFeedback, summarizeGoodPersonaFeedback } = await import(
      '../services/style-feedback-backfill.js'
    );
    const summary = await summarizeGoodPersonaFeedback();
    const result = await backfillStyleCorpusFromFeedback();
    res.json({ ok: true, summary, result });
  } catch (err) {
    console.error('[public/style-corpus/backfill]', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'backfill_failed', detail: err instanceof Error ? err.message : String(err) });
  }
});

/** Weekly chart harvest status — snapshot + last run (Railway volume / local data/). */
router.get('/chart-harvest/status', (_req: Request, res: Response) => {
  try {
    res.json(getChartHarvestStatus());
  } catch (err) {
    console.warn('[public/chart-harvest/status]', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'status_failed' });
  }
});

export default router;
