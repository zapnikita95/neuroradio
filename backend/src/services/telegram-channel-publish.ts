const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
const CHANNEL_ID = () => process.env.TELEGRAM_CHANNEL_ID?.trim() ?? '';

export function isTelegramChannelPublishConfigured(): boolean {
  return Boolean(BOT_TOKEN() && CHANNEL_ID());
}

export async function publishToTelegramChannel(text: string): Promise<number | null> {
  const token = BOT_TOKEN();
  const chatId = CHANNEL_ID();
  if (!token || !chatId) {
    console.warn('[telegram-channel] skip — TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID missing');
    return null;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),
        disable_web_page_preview: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { ok?: boolean; result?: { message_id?: number } };
    return data.result?.message_id ?? null;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err));
  }
}
