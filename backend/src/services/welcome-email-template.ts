export type WelcomeEmailLang = 'en' | 'ru';

export type WelcomeEmailLinks = {
  siteUrl: string;
  accountUrl: string;
  appStoreUrl: string | null;
  googlePlayUrl: string | null;
  apkUrl: string;
  extensionUrl: string;
};

export type WelcomeEmailContent = {
  lang: WelcomeEmailLang;
  email: string;
  plan: string;
  amount: number;
  currency: 'RUB' | 'USD';
  premiumUntilIso: string;
  links: WelcomeEmailLinks;
};

type Copy = {
  subject: string;
  title: string;
  lead: string;
  tariff: string;
  amount: string;
  accessUntil: string;
  yourEmail: string;
  howToTitle: string;
  steps: [string, string, string, string];
  installTitle: string;
  installLead: string;
  appStoreSub: string;
  googlePlaySub: string;
  apkLabel: string;
  extLabel: string;
  accountBtn: string;
  footerReceipt: string;
  footerQuestions: string;
};

const COPY: Record<WelcomeEmailLang, Copy> = {
  ru: {
    subject: 'Эфир AI — добро пожаловать, подписка активна',
    title: 'Добро пожаловать в Эфир AI',
    lead: 'Ваша подписка активна. Пока играет музыка, между треками звучат короткие истории с настоящими фактами — в выбранном вами голосе и амплуа.',
    tariff: 'Тариф',
    amount: 'Сумма',
    accessUntil: 'Доступ до',
    yourEmail: 'Ваш email',
    howToTitle: 'Как пользоваться',
    steps: [
      'Установите Эфир AI на устройство, где слушаете музыку — кнопки ниже.',
      'Войдите с email {email} — расширенный доступ включится автоматически.',
      'Запустите плеер, в настройках выберите амплуа, голос и темп речи.',
      'Между треками прозвучит короткая история — затем снова ваша музыка.',
    ],
    installTitle: 'Где установить',
    installLead: 'Один аккаунт на телефоне и в браузере. Подписка привязана к вашему email.',
    appStoreSub: 'приложение для iPhone',
    googlePlaySub: 'приложение для Android',
    apkLabel: 'APK для Android',
    extLabel: 'Расширение Chrome / Яндекс',
    accountBtn: 'Открыть личный кабинет',
    footerReceipt: 'Кассовый чек придёт отдельным письмом.',
    footerQuestions: 'Вопросы',
  },
  en: {
    subject: 'Efir AI — welcome, your subscription is active',
    title: 'Welcome to Efir AI',
    lead: 'Your subscription is active. While your music plays, short stories with real facts air between tracks — in the voice and persona you choose.',
    tariff: 'Plan',
    amount: 'Amount',
    accessUntil: 'Access until',
    yourEmail: 'Your email',
    howToTitle: 'How to get started',
    steps: [
      'Install Efir AI on the device where you listen to music — buttons below.',
      'Sign in with {email} — extended access unlocks automatically.',
      'Start your player, then pick persona, voice, and speech pace in Settings.',
      'A short story plays between tracks — then your music continues.',
    ],
    installTitle: 'Where to install',
    installLead: 'One account on your phone and in the browser. Your subscription is tied to your email.',
    appStoreSub: 'iPhone app',
    googlePlaySub: 'Android app',
    apkLabel: 'APK for Android',
    extLabel: 'Chrome / Yandex extension',
    accountBtn: 'Open account dashboard',
    footerReceipt: 'Your receipt will arrive in a separate email.',
    footerQuestions: 'Questions',
  },
};

function formatDate(iso: string, lang: WelcomeEmailLang): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatAmount(amount: number, currency: 'RUB' | 'USD'): string {
  if (currency === 'RUB') return `${amount} ₽`;
  return `$${amount.toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function storeButton(href: string, label: string, sublabel: string, bg: string): string {
  return `
    <tr>
      <td style="padding:6px 0;">
        <a href="${escapeHtml(href)}" style="display:block;text-decoration:none;border-radius:14px;padding:14px 18px;background:${bg};border:1px solid rgba(255,255,255,.12);">
          <div style="font-size:15px;font-weight:700;color:#ffffff;line-height:1.3;">${escapeHtml(label)}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.72);margin-top:4px;">${escapeHtml(sublabel)}</div>
        </a>
      </td>
    </tr>`;
}

function secondaryButton(href: string, label: string): string {
  return `
    <tr>
      <td style="padding:6px 0;">
        <a href="${escapeHtml(href)}" style="display:block;text-decoration:none;border-radius:14px;padding:12px 16px;background:rgba(255,255,255,.06);border:1px solid rgba(168,130,255,.35);">
          <div style="font-size:14px;font-weight:600;color:#e8d9ff;line-height:1.3;">${escapeHtml(label)}</div>
        </a>
      </td>
    </tr>`;
}

export function buildWelcomeEmail(content: WelcomeEmailContent): {
  subject: string;
  html: string;
  text: string;
} {
  const { lang, email, plan, amount, currency, premiumUntilIso, links } = content;
  const c = COPY[lang];
  const until = formatDate(premiumUntilIso, lang);
  const amountLabel = formatAmount(amount, currency);
  const brand = lang === 'en' ? 'Efir AI' : 'Эфир AI';
  const stepsHtml = c.steps
    .map((step) => `<li style="margin-bottom:8px;">${step.replace('{email}', `<strong style="color:#ffffff;">${escapeHtml(email)}</strong>`)}</li>`)
    .join('');

  const storeRows: string[] = [];
  if (links.appStoreUrl) {
    storeRows.push(storeButton(links.appStoreUrl, 'App Store', c.appStoreSub, 'linear-gradient(135deg,#5b2d82 0%,#8b3fd6 100%)'));
  }
  if (links.googlePlayUrl) {
    storeRows.push(storeButton(links.googlePlayUrl, 'Google Play', c.googlePlaySub, 'linear-gradient(135deg,#1f6b4f 0%,#2f9b6a 100%)'));
  }
  storeRows.push(secondaryButton(links.apkUrl, c.apkLabel));
  storeRows.push(secondaryButton(links.extensionUrl, c.extLabel));

  const storeTable =
    storeRows.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0 8px;">${storeRows.join('')}</table>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0b0913;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0913;">
    <tr>
      <td align="center" style="padding:32px 16px 48px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 24px;text-align:center;">
              <div style="display:inline-block;padding:10px 18px;border-radius:999px;background:rgba(168,130,255,.14);border:1px solid rgba(168,130,255,.35);color:#d8b4fe;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
                ${escapeHtml(brand)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="border-radius:24px;background:linear-gradient(180deg,#171223 0%,#120f1c 100%);border:1px solid rgba(168,130,255,.22);overflow:hidden;">
              <div style="height:4px;background:linear-gradient(90deg,#ff5da2 0%,#a855f7 45%,#5eead4 100%);"></div>
              <div style="padding:32px 28px 12px;">
                <div style="width:52px;height:52px;border-radius:50%;background:rgba(94,234,212,.12);border:1px solid rgba(94,234,212,.35);text-align:center;line-height:52px;font-size:24px;color:#5eead4;">✓</div>
                <h1 style="margin:18px 0 10px;font-size:28px;line-height:1.2;color:#ffffff;font-weight:800;">${escapeHtml(c.title)}</h1>
                <p style="margin:0;font-size:16px;line-height:1.6;color:#b8afc9;">${escapeHtml(c.lead)}</p>
              </div>
              <div style="margin:0 28px 24px;padding:18px 20px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr><td style="padding:6px 0;font-size:14px;color:#9f94b3;">${escapeHtml(c.tariff)}</td><td align="right" style="padding:6px 0;font-size:14px;color:#ffffff;font-weight:600;">${escapeHtml(plan)}</td></tr>
                  <tr><td style="padding:6px 0;font-size:14px;color:#9f94b3;">${escapeHtml(c.amount)}</td><td align="right" style="padding:6px 0;font-size:14px;color:#ffffff;font-weight:600;">${escapeHtml(amountLabel)}</td></tr>
                  <tr><td style="padding:6px 0;font-size:14px;color:#9f94b3;">${escapeHtml(c.accessUntil)}</td><td align="right" style="padding:6px 0;font-size:14px;color:#d8b4fe;font-weight:700;">${escapeHtml(until)}</td></tr>
                  <tr><td style="padding:6px 0;font-size:14px;color:#9f94b3;">${escapeHtml(c.yourEmail)}</td><td align="right" style="padding:6px 0;font-size:14px;color:#ffffff;font-weight:600;">${escapeHtml(email)}</td></tr>
                </table>
              </div>
              <div style="padding:0 28px 28px;">
                <h2 style="margin:0 0 12px;font-size:18px;color:#ffffff;">${escapeHtml(c.howToTitle)}</h2>
                <ol style="margin:0 0 18px;padding-left:20px;color:#c7bdd8;font-size:15px;line-height:1.7;">${stepsHtml}</ol>
                <h2 style="margin:0 0 8px;font-size:18px;color:#ffffff;">${escapeHtml(c.installTitle)}</h2>
                <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#9f94b3;">${escapeHtml(c.installLead)}</p>
                ${storeTable}
                <div style="margin-top:22px;text-align:center;">
                  <a href="${escapeHtml(links.accountUrl)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:linear-gradient(135deg,#ff5da2 0%,#a855f7 100%);color:#1a0c25;font-size:14px;font-weight:800;text-decoration:none;">${escapeHtml(c.accountBtn)}</a>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;text-align:center;color:#7d738f;font-size:13px;line-height:1.6;">
              ${escapeHtml(c.footerReceipt)}<br />
              ${escapeHtml(c.footerQuestions)}: <a href="mailto:hello@efir-ai.ru" style="color:#c4b5fd;text-decoration:none;">hello@efir-ai.ru</a> ·
              <a href="${escapeHtml(links.siteUrl)}" style="color:#c4b5fd;text-decoration:none;">efir-ai.ru</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const storeLines: string[] = [];
  if (links.appStoreUrl) storeLines.push(`App Store: ${links.appStoreUrl}`);
  if (links.googlePlayUrl) storeLines.push(`Google Play: ${links.googlePlayUrl}`);
  storeLines.push(`${c.apkLabel}: ${links.apkUrl}`);
  storeLines.push(`${c.extLabel}: ${links.extensionUrl}`);

  const stepsText = c.steps.map((s, i) => `${i + 1}. ${s.replace('{email}', email)}`).join('\n');

  const text =
    `${c.subject}\n\n` +
    `${c.lead}\n\n` +
    `${c.tariff}: ${plan}\n` +
    `${c.amount}: ${amountLabel}\n` +
    `${c.accessUntil}: ${until}\n` +
    `${c.yourEmail}: ${email}\n\n` +
    `${c.howToTitle}:\n${stepsText}\n\n` +
    `${c.installTitle}:\n${storeLines.map((line) => `• ${line}`).join('\n')}\n\n` +
    `${c.accountBtn}: ${links.accountUrl}\n\n` +
    `${c.footerReceipt}\n` +
    `${c.footerQuestions}: hello@efir-ai.ru`;

  return { subject: c.subject, html, text };
}

/** @deprecated use buildWelcomeEmail */
export function buildPaymentSuccessEmail(
  content: Omit<WelcomeEmailContent, 'lang' | 'amount' | 'currency'> & {
    amountRub: number;
  },
): { html: string; text: string } {
  const built = buildWelcomeEmail({
    ...content,
    lang: 'ru',
    amount: content.amountRub,
    currency: 'RUB',
  });
  return { html: built.html, text: built.text };
}
