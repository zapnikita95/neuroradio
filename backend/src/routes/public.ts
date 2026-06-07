import { Router, Request, Response } from 'express';
import {
  createYooKassaPayment,
  isYooKassaConfigured,
  markPaymentSucceeded,
  parseYooKassaWebhook,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from '../services/yookassa.js';
import { grantPremiumByEmail } from '../services/account-store.js';
import {
  isEmailConfigured,
  sendPaymentLinkEmail,
  sendPaymentSuccessEmail,
  sendReceiptRequestEmail,
  sendSubscribeEmail,
} from '../services/email-sender.js';
import {
  canUseSileroTts,
  getSileroTtsBaseUrl,
  probeSileroTtsHealth,
} from '../services/silero-tts.js';
import { SILERO_VOICE_PRESETS } from '../services/silero-voices.js';
import { hasYandexCredentials } from '../services/yandex-tts.js';

const router = Router();

/** TTS options for free tier (Silero vs Android device TTS). */
router.get('/tts-config', async (_req: Request, res: Response) => {
  const sileroConfigured = canUseSileroTts();
  const sileroUrl = getSileroTtsBaseUrl();
  let sileroHealthy = false;
  if (sileroConfigured && sileroUrl) {
    sileroHealthy = await probeSileroTtsHealth(sileroUrl);
  }
  res.json({
    freeTier: {
      serverEngine: sileroConfigured && sileroHealthy ? 'silero' : hasYandexCredentials() ? 'yandex' : null,
      deviceEngine: 'android',
    },
    silero: {
      enabled: sileroConfigured,
      healthy: sileroHealthy,
      urlConfigured: Boolean(sileroUrl),
      presets: SILERO_VOICE_PRESETS.map((p) => ({
        id: p.id,
        voice: p.voice,
        labelRu: p.labelRu,
        moodRu: p.moodRu,
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
    const created = await createYooKassaPayment({ email, plan });
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

    if (email && plan) {
      const planMeta = SUBSCRIPTION_PLANS[plan];
      try {
        const entitlement = grantPremiumByEmail(email, {
          months: planMeta.months,
          productId: planMeta.productId,
        });
        const premiumUntilIso = new Date(entitlement.premiumUntil).toISOString();
        if (isEmailConfigured()) {
          void sendPaymentSuccessEmail({
            to: email,
            plan: planMeta.labelRu,
            amountRub: planMeta.amountRub,
            premiumUntilIso,
          }).catch((err) => {
            console.warn('[yookassa/webhook] user success email failed:', err instanceof Error ? err.message : err);
          });
          void sendReceiptRequestEmail({
            userEmail: email,
            plan: planMeta.labelRu,
            amountRub: planMeta.amountRub,
            paymentId: paymentId ?? 'unknown',
            premiumUntilIso,
          }).catch((err) => {
            console.warn('[yookassa/webhook] receipt request email failed:', err instanceof Error ? err.message : err);
          });
        }
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
      const created = await createYooKassaPayment({ email, plan });
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

export default router;
