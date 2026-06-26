/**
 * Admin notifications via existing auth bot (TELEGRAM_BOT_TOKEN).
 * Set TELEGRAM_ADMIN_CHAT_ID to your numeric chat id (@userinfobot).
 */
const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() ?? '';

export function isTelegramAdminNotifyConfigured(): boolean {
  return Boolean(BOT_TOKEN() && ADMIN_CHAT());
}

export async function sendTelegramAdminMessage(text: string): Promise<boolean> {
  const token = BOT_TOKEN();
  const chatId = ADMIN_CHAT();
  if (!token || !chatId) {
    console.warn('[telegram-admin] skip — TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID missing');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[telegram-admin] send failed ${res.status}: ${body.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[telegram-admin] send error:', err instanceof Error ? err.message : err);
    return false;
  }
}
