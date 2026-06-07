const RESEND_API = 'https://api.resend.com/emails';

export function isEmailConfigured(): boolean {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  return Boolean(apiKey && from);
}

export async function sendLoginCodeEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error('Resend not configured (RESEND_API_KEY, RESEND_FROM)');
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Эфир AI — код входа',
      text: `Код для входа в Эфир AI: ${code}\n\nДействует 15 минут.`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}

export async function sendSubscribeEmail(options: {
  to: string;
  plan: string;
  amount: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error('Resend not configured (RESEND_API_KEY, RESEND_FROM)');
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: `Эфир AI — ${options.plan}`,
      text:
        `Спасибо за интерес к Эфир AI!\n\n` +
        `Тариф: ${options.plan}${options.amount ? ` (${options.amount} ₽)` : ''}\n\n` +
        `Скачайте приложение: https://github.com/zapnikita95/neuroradio/releases/latest\n` +
        `Войдите с этим email — подписка активируется автоматически после оплаты.\n\n` +
        `Вопросы: hello@efir-ai.ru`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}

function receiptAdminEmail(): string {
  return (
    process.env.RECEIPT_ADMIN_EMAIL?.trim() ||
    process.env.BILLING_ADMIN_EMAIL?.trim() ||
    'zap.nikita95@gmail.com'
  );
}

export async function sendPaymentSuccessEmail(options: {
  to: string;
  plan: string;
  amountRub: number;
  premiumUntilIso: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error('Resend not configured (RESEND_API_KEY, RESEND_FROM)');
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: `Эфир AI — оплата прошла, подписка активна`,
      text:
        `Спасибо за оплату!\n\n` +
        `Тариф: ${options.plan}\n` +
        `Сумма: ${options.amountRub} ₽\n` +
        `Расширенный доступ до: ${options.premiumUntilIso}\n\n` +
        `Войдите в приложение с этим email — лимиты и модель DeepSeek V3 включатся автоматически.\n\n` +
        `Кассовый чек придёт отдельным письмом в ближайшее время.\n\n` +
        `Вопросы: hello@efir-ai.ru`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}

/** Письмо админу: нужно отправить чек пользователю. */
export async function sendReceiptRequestEmail(options: {
  userEmail: string;
  plan: string;
  amountRub: number;
  paymentId: string;
  premiumUntilIso: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error('Resend not configured (RESEND_API_KEY, RESEND_FROM)');
  }

  const admin = receiptAdminEmail();
  const baseUrl =
    process.env.PUBLIC_BFF_URL?.trim() ||
    process.env.TELEGRAM_WIDGET_BASE_URL?.trim() ||
    'https://neuroradio-production-3966.up.railway.app';
  const secretHint = process.env.BILLING_ADMIN_SECRET?.trim()
    ? 'Заголовок x-billing-admin-secret из Railway Variables.'
    : 'Задайте BILLING_ADMIN_SECRET на сервере.';

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [admin],
      reply_to: admin,
      subject: `[Эфир AI] Чек для ${options.userEmail} · ${options.amountRub} ₽`,
      text:
        `Нужен чек для пользователя.\n\n` +
        `Email пользователя: ${options.userEmail}\n` +
        `Тариф: ${options.plan}\n` +
        `Сумма: ${options.amountRub} ₽\n` +
        `Payment ID YooKassa: ${options.paymentId}\n` +
        `Premium до: ${options.premiumUntilIso}\n\n` +
        `Отправить чек пользователю (API):\n` +
        `POST ${baseUrl.replace(/\/$/, '')}/v1/billing/admin/receipt\n` +
        `Content-Type: application/json\n` +
        `x-billing-admin-secret: <секрет>\n` +
        `{\n` +
        `  "to": "${options.userEmail}",\n` +
        `  "paymentId": "${options.paymentId}",\n` +
        `  "subject": "Кассовый чек Эфир AI",\n` +
        `  "text": "Текст чека / ссылка / реквизиты…"\n` +
        `}\n\n` +
        secretHint + '\n\n' +
        `Либо перешлите PDF чека из ЮKassa на ${options.userEmail} вручную.`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}

export async function sendReceiptToUserEmail(options: {
  to: string;
  subject?: string;
  text: string;
  paymentId?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error('Resend not configured (RESEND_API_KEY, RESEND_FROM)');
  }

  const subject = options.subject?.trim() || 'Эфир AI — кассовый чек';
  const footer = options.paymentId ? `\n\nPayment ID: ${options.paymentId}` : '';

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [options.to.trim().toLowerCase()],
      subject,
      text: `${options.text.trim()}${footer}\n\nЭфир AI · hello@efir-ai.ru`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}

export async function sendPaymentLinkEmail(options: {
  to: string;
  plan: string;
  amountRub: number;
  paymentUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error('Resend not configured (RESEND_API_KEY, RESEND_FROM)');
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: `Эфир AI — оплата ${options.plan}`,
      text:
        `Здравствуйте!\n\n` +
        `Вы оформляете подписку «${options.plan}» на ${options.amountRub} ₽.\n\n` +
        `Перейдите по ссылке для оплаты:\n${options.paymentUrl}\n\n` +
        `После оплаты войдите в приложение или расширение с адресом ${options.to} — ` +
        `расширенный доступ активируется автоматически.\n\n` +
        `Скачать приложение: https://github.com/zapnikita95/neuroradio/releases/latest\n\n` +
        `Вопросы: hello@efir-ai.ru`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}
