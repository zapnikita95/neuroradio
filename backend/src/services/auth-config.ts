import { isEmailConfigured } from './email-sender.js';
import {
  isTelegramOAuthConfigured,
  resolveTelegramOAuthRedirectUri,
  telegramBotNumericId,
} from './telegram-oidc.js';

export function telegramBotUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && telegramBotUsername());
}

/**
 * Origin for Telegram Login Widget — HTTPS only (iOS ATS / Android cleartext).
 * efir-ai.ru apex redirects to http://www — use www for WebView embed.
 */
export function resolveTelegramWidgetBaseUrl(): string | null {
  const raw =
    process.env.TELEGRAM_WIDGET_BASE_URL?.trim() ||
    process.env.PUBLIC_BFF_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    null;
  if (!raw) return null;

  const forcedHost = process.env.TELEGRAM_WIDGET_DOMAIN?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  if (forcedHost) {
    return normalizeTelegramWidgetOrigin(forcedHost);
  }

  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return normalizeTelegramWidgetOrigin(u.hostname);
  } catch {
    const cleaned = raw
      .replace(/^http:\/\//i, 'https://')
      .replace(/\/$/, '');
    try {
      const u = new URL(cleaned.startsWith('https://') ? cleaned : `https://${cleaned}`);
      return normalizeTelegramWidgetOrigin(u.hostname);
    } catch {
      return cleaned;
    }
  }
}

function normalizeTelegramWidgetOrigin(hostOrOrigin: string): string {
  let host = hostOrOrigin
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  if (!host) return 'https://www.efir-ai.ru';

  // Apex efir-ai.ru → 301 to insecure http://www — load widget from www directly.
  if (host === 'efir-ai.ru') {
    host = 'www.efir-ai.ru';
  }

  return `https://${host}`;
}

export function getPublicAuthConfig(): {
  emailEnabled: boolean;
  telegramEnabled: boolean;
  telegramOAuthEnabled: boolean;
  appleSignInEnabled: boolean;
  telegramBotUsername: string | null;
  telegramBotId: string | null;
  telegramOAuthRedirectUri: string | null;
  telegramWidgetBaseUrl: string | null;
} {
  const widgetBase = resolveTelegramWidgetBaseUrl();
  const botUsername = telegramBotUsername();
  const oauthReady = isTelegramOAuthConfigured();
  return {
    // Email login works without SMTP (reviewer codes + server logs).
    emailEnabled: true,
    telegramEnabled: oauthReady || isTelegramConfigured(),
    telegramOAuthEnabled: oauthReady,
    appleSignInEnabled: true,
    telegramBotUsername: botUsername,
    telegramBotId: telegramBotNumericId(),
    telegramOAuthRedirectUri: oauthReady ? resolveTelegramOAuthRedirectUri() : null,
    telegramWidgetBaseUrl: widgetBase,
  };
}
