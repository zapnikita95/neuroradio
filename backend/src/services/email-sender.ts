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
