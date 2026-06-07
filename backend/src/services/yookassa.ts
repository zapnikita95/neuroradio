import crypto from 'node:crypto';

const YOOKASSA_API = 'https://api.yookassa.ru/v3';

export type SubscriptionPlan = 'month' | 'quarter' | 'year';

export const SUBSCRIPTION_PLANS: Record<
  SubscriptionPlan,
  { amountRub: number; months: number; labelRu: string; productId: string }
> = {
  month: { amountRub: 199, months: 1, labelRu: 'Расширенный · месяц', productId: 'efir_premium_month' },
  quarter: { amountRub: 499, months: 3, labelRu: 'Расширенный · квартал', productId: 'efir_premium_quarter' },
  year: { amountRub: 1999, months: 12, labelRu: 'Расширенный · год', productId: 'efir_premium_year' },
};

export function isYooKassaConfigured(): boolean {
  return Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim());
}

function authHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim() ?? '';
  const secret = process.env.YOOKASSA_SECRET_KEY?.trim() ?? '';
  return `Basic ${Buffer.from(`${shopId}:${secret}`).toString('base64')}`;
}

export type PendingPayment = {
  yookassaPaymentId: string;
  email: string;
  plan: SubscriptionPlan;
  amountRub: number;
  status: 'pending' | 'succeeded' | 'canceled';
  createdAt: number;
};

const pendingById = new Map<string, PendingPayment>();

export function getPendingPayment(id: string): PendingPayment | undefined {
  return pendingById.get(id);
}

export function markPaymentSucceeded(id: string): PendingPayment | undefined {
  const row = pendingById.get(id);
  if (!row) return undefined;
  row.status = 'succeeded';
  pendingById.set(id, row);
  return row;
}

export async function createYooKassaPayment(options: {
  email: string;
  plan: SubscriptionPlan;
  returnUrl?: string;
}): Promise<{ paymentId: string; confirmationUrl: string; amountRub: number; planLabel: string }> {
  if (!isYooKassaConfigured()) {
    throw new Error('YOOKASSA_NOT_CONFIGURED');
  }

  const planMeta = SUBSCRIPTION_PLANS[options.plan];
  const returnUrl =
    options.returnUrl?.trim() ||
    process.env.YOOKASSA_RETURN_URL?.trim() ||
    'https://www.efir-ai.ru/?payment=success';

  const idempotenceKey = crypto.randomUUID();
  const res = await fetch(`${YOOKASSA_API}/payments`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: planMeta.amountRub.toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl },
      description: `Эфир AI — ${planMeta.labelRu}`,
      metadata: {
        email: options.email.trim().toLowerCase(),
        plan: options.plan,
        service: 'efir-ai',
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`YooKassa HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  const data = (await res.json()) as {
    id?: string;
    confirmation?: { confirmation_url?: string };
  };
  const paymentId = data.id?.trim();
  const confirmationUrl = data.confirmation?.confirmation_url?.trim();
  if (!paymentId || !confirmationUrl) {
    throw new Error('YooKassa response missing payment id or confirmation URL');
  }

  pendingById.set(paymentId, {
    yookassaPaymentId: paymentId,
    email: options.email.trim().toLowerCase(),
    plan: options.plan,
    amountRub: planMeta.amountRub,
    status: 'pending',
    createdAt: Date.now(),
  });

  return {
    paymentId,
    confirmationUrl,
    amountRub: planMeta.amountRub,
    planLabel: planMeta.labelRu,
  };
}

export type YooKassaWebhookEvent = {
  event?: string;
  object?: {
    id?: string;
    status?: string;
    metadata?: { email?: string; plan?: string };
  };
};

export function parseYooKassaWebhook(body: unknown): YooKassaWebhookEvent | null {
  if (!body || typeof body !== 'object') return null;
  return body as YooKassaWebhookEvent;
}
