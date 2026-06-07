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

const GH_REPO = process.env.GITHUB_REPO?.trim() || 'zapnikita95/neuroradio';
const APK_URL = `https://github.com/${GH_REPO}/releases/latest/download/MusicStory.apk`;
const EXT_URL = `https://github.com/${GH_REPO}/releases/latest/download/efir-extension.zip`;
const SITE_URL = process.env.SITE_URL?.trim() || 'https://efir-ai.ru';

export interface SubscribeEmailInput {
  to: string;
  plan: string;
  amount: string;
}

/** Письмо после оформления подписки: ссылки на загрузку APK и расширения. */
export async function sendSubscribeEmail({ to, plan, amount }: SubscribeEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error('Resend not configured (RESEND_API_KEY, RESEND_FROM)');
  }

  const amountLine = amount ? `${amount} ₽` : '';
  const text = [
    `Спасибо, что выбрали Эфир AI!`,
    ``,
    `Тариф: ${plan}${amountLine ? ` — ${amountLine}` : ''}`,
    ``,
    `Скачать приложение для Android (APK): ${APK_URL}`,
    `Скачать расширение для браузера: ${EXT_URL}`,
    ``,
    `Войдите в приложение или расширение с этим адресом электронной почты (${to}) — расширенный доступ активируется автоматически.`,
    ``,
    `Сайт: ${SITE_URL}`,
  ].join('\n');

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1c1430">
    <h2 style="margin:0 0 6px">Спасибо, что выбрали Эфир AI!</h2>
    <p style="color:#5b5470;margin:0 0 18px">Тариф: <strong>${plan}</strong>${amountLine ? ` — ${amountLine}` : ''}</p>
    <p style="margin:0 0 14px">Скачайте Эфир AI на удобной платформе:</p>
    <p style="margin:0 0 10px">
      <a href="${APK_URL}" style="display:inline-block;background:#a855f7;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">▼ Скачать APK для Android</a>
    </p>
    <p style="margin:0 0 18px">
      <a href="${EXT_URL}" style="display:inline-block;background:#14101f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">🧩 Скачать расширение для браузера</a>
    </p>
    <p style="color:#5b5470;margin:0 0 8px">Войдите в приложение или расширение с этим адресом электронной почты (<strong>${to}</strong>) — расширенный доступ активируется автоматически.</p>
    <p style="color:#9a93ad;font-size:13px;margin:18px 0 0"><a href="${SITE_URL}" style="color:#a855f7">${SITE_URL}</a></p>
  </div>`;

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Эфир AI — ссылки на загрузку и доступ',
      text,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}
