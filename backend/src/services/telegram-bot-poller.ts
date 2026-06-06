import {
  extractMobileAuthCodeFromText,
  markTelegramMobileCodeVerified,
} from './telegram-mobile-auth.js';

interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}

interface TgChat {
  id: number;
}

interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

async function tgCall<T>(method: string, body?: Record<string, unknown>): Promise<T | null> {
  const token = botToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json()) as { ok?: boolean; result?: T };
    if (!json.ok) {
      console.warn(`[telegram-bot] ${method} failed:`, JSON.stringify(json).slice(0, 200));
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    console.warn(`[telegram-bot] ${method} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function sendReply(chatId: number, text: string, replyTo?: number): Promise<void> {
  await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    reply_to_message_id: replyTo,
  });
}

async function handleMessage(msg: TgMessage): Promise<void> {
  const code = extractMobileAuthCodeFromText(msg.text);
  if (!code) return;

  const user = msg.from;
  if (!user?.id) return;

  const ok = markTelegramMobileCodeVerified(code, user.id, user.username);
  if (ok) {
    await sendReply(
      msg.chat.id,
      '✅ Вход в Music Story подтверждён.\nВернись в приложение — вход завершится автоматически.',
      msg.message_id,
    );
  } else {
    await sendReply(
      msg.chat.id,
      '❌ Ссылка или код устарели.\nВ приложении нажми «Telegram» ещё раз.',
      msg.message_id,
    );
  }
}

let polling = false;
let stopRequested = false;

export function stopTelegramBotPolling(): void {
  stopRequested = true;
}

export async function startTelegramBotPolling(): Promise<void> {
  if (polling || !botToken()) return;
  polling = true;
  stopRequested = false;

  await tgCall('deleteWebhook', { drop_pending_updates: false });
  console.log('[telegram-bot] long polling started (mobileauth /start)');

  let offset = 0;
  while (!stopRequested) {
    const updates = await tgCall<TgUpdate[]>('getUpdates', {
      offset,
      timeout: 30,
      allowed_updates: ['message'],
    });

    if (stopRequested) break;

    if (!updates) {
      await sleep(2_000);
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1;
      const msg = update.message;
      if (msg?.text) {
        void handleMessage(msg).catch((err) => {
          console.warn('[telegram-bot] handleMessage:', err instanceof Error ? err.message : err);
        });
      }
    }
  }

  polling = false;
  console.log('[telegram-bot] polling stopped');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTelegramBotConfigured(): boolean {
  const token = botToken();
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim();
  return Boolean(token && username);
}
