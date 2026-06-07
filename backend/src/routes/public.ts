import { Router, Request, Response } from 'express';
import { isEmailConfigured, sendSubscribeEmail } from '../services/email-sender.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Канонические подписи тарифов по сумме — не доверяем тексту с клиента в письме. */
const PLAN_BY_AMOUNT: Record<string, string> = {
  '199': 'Расширенный · месяц',
  '499': 'Расширенный · квартал',
  '1999': 'Расширенный · год',
};

// Простой anti-abuse лимит по IP: не больше 5 запросов за 10 минут.
const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 5;

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

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of hits.entries()) {
    if (now >= bucket.resetAt) hits.delete(key);
  }
}, WINDOW_MS).unref();

/**
 * Публичное оформление подписки с сайта: проверяем email и отправляем письмо
 * со ссылками на загрузку APK и расширения через Resend. Оплата привязывается
 * к этому адресу — по нему подписка распознаётся в приложении и расширении.
 */
router.post('/subscribe', async (req: Request, res: Response) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown';

  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' });
    return;
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const amount = typeof req.body?.amount === 'string' ? req.body.amount.replace(/[^\d]/g, '') : '';

  if (!EMAIL_RE.test(email) || email.length > 254) {
    res.status(400).json({ error: 'Введите корректный email' });
    return;
  }

  const planName = PLAN_BY_AMOUNT[amount] ?? 'Расширенный';

  // Без Resend письмо не отправляем, но не ломаем сценарий — фронт покажет успех.
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
