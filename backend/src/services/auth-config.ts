import { isEmailConfigured } from './email-sender.js';

export function telegramBotUsername(): string | null {
  return process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && telegramBotUsername());
}

export function getPublicAuthConfig(): {
  emailEnabled: boolean;
  telegramEnabled: boolean;
  telegramBotUsername: string | null;
  telegramWidgetBaseUrl: string | null;
} {
  const widgetBase = process.env.TELEGRAM_WIDGET_BASE_URL?.trim().replace(/\/$/, '') ?? null;
  const botUsername = telegramBotUsername();
  return {
    emailEnabled: isEmailConfigured(),
    telegramEnabled: isTelegramConfigured(),
    telegramBotUsername: botUsername,
    telegramWidgetBaseUrl: widgetBase,
  };
}
