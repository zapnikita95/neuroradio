import { isEmailConfigured } from './email-sender.js';

export function telegramBotUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && telegramBotUsername());
}

/**
 * Origin for Telegram Login Widget — must match @BotFather /setdomain exactly.
 * BotFather usually registers apex (efir-ai.ru), not www — strip www by default.
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
    try {
      return new URL(`https://${forcedHost}`).origin;
    } catch {
      return raw.replace(/\/$/, '');
    }
  }

  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    // Keep www only when explicitly requested (TELEGRAM_WIDGET_KEEP_WWW=true).
    if (u.hostname.startsWith('www.') && process.env.TELEGRAM_WIDGET_KEEP_WWW !== 'true') {
      u.hostname = u.hostname.slice(4);
    }
    return u.origin;
  } catch {
    return raw.replace(/\/$/, '');
  }
}

export function getPublicAuthConfig(): {
  emailEnabled: boolean;
  telegramEnabled: boolean;
  telegramBotUsername: string | null;
  telegramWidgetBaseUrl: string | null;
} {
  const widgetBase = resolveTelegramWidgetBaseUrl();
  const botUsername = telegramBotUsername();
  return {
    emailEnabled: isEmailConfigured(),
    telegramEnabled: isTelegramConfigured(),
    telegramBotUsername: botUsername,
    telegramWidgetBaseUrl: widgetBase,
  };
}
