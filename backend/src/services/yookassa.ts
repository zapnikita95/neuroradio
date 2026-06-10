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

/** International USD pricing (Play Billing / Stripe). */
export const SUBSCRIPTION_PLANS_USD: Record<
  SubscriptionPlan,
  { amountUsd: number; months: number; labelEn: string; productId: string }
> = {
  month: { amountUsd: 3.99, months: 1, labelEn: 'Extended · month', productId: 'efir_premium_month_usd' },
  quarter: { amountUsd: 9.99, months: 3, labelEn: 'Extended · quarter', productId: 'efir_premium_quarter_usd' },
  year: { amountUsd: 39.99, months: 12, labelEn: 'Extended · year', productId: 'efir_premium_year_usd' },
};

export function isYooKassaConfigured(): boolean {
  return Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim());
}

/** Autopay (save card + recurring charges). Off until YooMoney enables it for the shop. */
export function isYooKassaRecurringEnabled(): boolean {
  const raw = process.env.YOOKASSA_RECURRING_ENABLED?.trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return false;
}

function isRecurringForbiddenError(status: number, detail: string): boolean {
  if (status !== 403) return false;
  const lower = detail.toLowerCase();
  return lower.includes('recurring') || lower.includes('автоплат');
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

  const wantSaveCard = isYooKassaRecurringEnabled();
  let savePaymentMethod = wantSaveCard;
  let idempotenceKey = crypto.randomUUID();
  let res = await postYooKassaRedirectPayment({
    planMeta,
    email: options.email,
    plan: options.plan,
    returnUrl,
    savePaymentMethod,
    idempotenceKey,
  });

  if (!res.ok && savePaymentMethod) {
    const detail = await res.text().catch(() => '');
    if (isRecurringForbiddenError(res.status, detail)) {
      console.warn(
        '[yookassa] shop cannot save cards yet — retrying payment without save_payment_method. ' +
          'Enable recurring in YooMoney or set YOOKASSA_RECURRING_ENABLED=true when ready.',
      );
      savePaymentMethod = false;
      idempotenceKey = crypto.randomUUID();
      res = await postYooKassaRedirectPayment({
        planMeta,
        email: options.email,
        plan: options.plan,
        returnUrl,
        savePaymentMethod: false,
        idempotenceKey,
      });
    } else {
      throw new Error(`YooKassa HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
  }

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
    metadata?: { email?: string; plan?: string; recurring?: string | boolean };
  };
};

export type YooKassaPaymentDetails = {
  id: string;
  status: string;
  paymentMethodId: string | null;
  paymentMethodSaved: boolean;
  metadata?: { email?: string; plan?: string; recurring?: string | boolean };
};

export async function fetchYooKassaPayment(paymentId: string): Promise<YooKassaPaymentDetails | null> {
  if (!isYooKassaConfigured()) return null;
  const res = await fetch(`${YOOKASSA_API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn(`[yookassa] fetch payment ${paymentId} HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    return null;
  }
  const data = (await res.json()) as {
    id?: string;
    status?: string;
    payment_method?: { id?: string; saved?: boolean };
    metadata?: { email?: string; plan?: string; recurring?: string | boolean };
  };
  const id = data.id?.trim();
  if (!id) return null;
  const pm = data.payment_method;
  return {
    id,
    status: data.status ?? 'unknown',
    paymentMethodId: pm?.id?.trim() ?? null,
    paymentMethodSaved: Boolean(pm?.saved && pm?.id),
    metadata: data.metadata,
  };
}

export async function createRecurringYooKassaPayment(options: {
  email: string;
  plan: SubscriptionPlan;
  paymentMethodId: string;
}): Promise<{ paymentId: string; status: string }> {
  if (!isYooKassaConfigured()) {
    throw new Error('YOOKASSA_NOT_CONFIGURED');
  }
  if (!isYooKassaRecurringEnabled()) {
    throw new Error('YOOKASSA_RECURRING_DISABLED');
  }
  const planMeta = SUBSCRIPTION_PLANS[options.plan];
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
      payment_method_id: options.paymentMethodId,
      description: `Эфир AI — ${planMeta.labelRu} (автопродление)`,
      metadata: {
        email: options.email.trim().toLowerCase(),
        plan: options.plan,
        service: 'efir-ai',
        recurring: 'true',
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`YooKassa recurring HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }
  const data = (await res.json()) as { id?: string; status?: string };
  const paymentId = data.id?.trim();
  if (!paymentId) throw new Error('YooKassa recurring response missing payment id');

  pendingById.set(paymentId, {
    yookassaPaymentId: paymentId,
    email: options.email.trim().toLowerCase(),
    plan: options.plan,
    amountRub: planMeta.amountRub,
    status: 'pending',
    createdAt: Date.now(),
  });

  return { paymentId, status: data.status ?? 'pending' };
}

export function parseYooKassaWebhook(body: unknown): YooKassaWebhookEvent | null {
  if (!body || typeof body !== 'object') return null;
  return body as YooKassaWebhookEvent;
}

async function postYooKassaRedirectPayment(options: {
  planMeta: (typeof SUBSCRIPTION_PLANS)[SubscriptionPlan];
  email: string;
  plan: SubscriptionPlan;
  returnUrl: string;
  savePaymentMethod: boolean;
  idempotenceKey: string;
}): Promise<Response> {
  const body: Record<string, unknown> = {
    amount: { value: options.planMeta.amountRub.toFixed(2), currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: options.returnUrl },
    description: options.savePaymentMethod
      ? `Эфир AI — ${options.planMeta.labelRu} (автопродление)`
      : `Эфир AI — ${options.planMeta.labelRu}`,
    metadata: {
      email: options.email.trim().toLowerCase(),
      plan: options.plan,
      service: 'efir-ai',
      recurring: 'false',
    },
  };
  if (options.savePaymentMethod) {
    body.save_payment_method = true;
  }

  return fetch(`${YOOKASSA_API}/payments`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      'Idempotence-Key': options.idempotenceKey,
    },
    body: JSON.stringify(body),
  });
}
