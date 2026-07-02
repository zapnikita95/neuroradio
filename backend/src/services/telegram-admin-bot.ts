import {
  approveSocialPublishItem,
  listSocialPublishQueue,
  rejectSocialPublishItem,
  type SocialPublishQueueItem,
} from './social-publish-queue.js';
import { runSocialPublishTick } from './social-publish-tick.js';
import { isTelegramChannelPublishConfigured } from './telegram-channel-publish.js';
import { isVkWallPublishConfigured } from './vk-wall-publish.js';
import { isBlueskyPublishConfigured } from './bluesky-publish.js';
import { isMastodonPublishConfigured } from './mastodon-publish.js';
import { isPostizPublishConfigured, parsePostizIntegrations } from './postiz-publish.js';

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() ?? '';
const WEBHOOK_SECRET = () => process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';

type InlineKeyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export function socialApproveKeyboard(queueId: string): InlineKeyboard {
  const short = queueId.slice(0, 36);
  return {
    inline_keyboard: [
      [
        { text: '✅ Одобрить', callback_data: `sa:${short}` },
        { text: '❌ Отклонить', callback_data: `sr:${short}` },
      ],
      [{ text: '🚀 Опубликовать сейчас', callback_data: `sp:${short}` }],
    ],
  };
}

export async function sendSocialCandidateToAdmin(
  item: SocialPublishQueueItem,
  preview: string,
): Promise<boolean> {
  const token = BOT_TOKEN();
  const chatId = ADMIN_CHAT();
  if (!token || !chatId) return false;

  const dests = listConfiguredSocialDestinations()
    .filter((d) => d.configured)
    .map((d) => d.label)
    .join(', ');

  const text =
    `⭐ Кандидат в автопост (${item.source})\n` +
    `${item.artist} — ${item.title}\n` +
    `Амплуа: ${item.narrator}\n` +
    (dests ? `Куда: ${dests}\n` : '⚠️ Нет настроенных каналов — задай env на Railway\n') +
    `\n${preview}${item.voicedText.length > 320 ? '…' : ''}`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
        reply_markup: socialApproveKeyboard(item.id),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch (err) {
    console.warn('[telegram-admin-bot] send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

async function telegramApi(method: string, body: Record<string, unknown>): Promise<boolean> {
  const token = BOT_TOKEN();
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}

function resolveQueueId(shortId: string): string | null {
  const item = listSocialPublishQueue().find((i) => i.id.startsWith(shortId));
  return item?.id ?? null;
}

async function handleCallback(data: string, callbackQueryId: string, chatId: string): Promise<void> {
  if (chatId !== ADMIN_CHAT()) {
    await telegramApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: 'Только для admin chat',
      show_alert: true,
    });
    return;
  }

  const match = /^(sa|sr|sp):(.+)$/.exec(data);
  if (!match) return;
  const [, action, shortId] = match;
  const id = resolveQueueId(shortId);
  if (!id) {
    await telegramApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: 'Запись не найдена',
      show_alert: true,
    });
    return;
  }

  if (action === 'sa') {
    approveSocialPublishItem(id);
    await telegramApi('answerCallbackQuery', { callback_query_id: callbackQueryId, text: 'Одобрено ✅' });
  } else if (action === 'sr') {
    rejectSocialPublishItem(id, 'rejected via telegram');
    await telegramApi('answerCallbackQuery', { callback_query_id: callbackQueryId, text: 'Отклонено' });
  } else if (action === 'sp') {
    approveSocialPublishItem(id);
    const result = await runSocialPublishTick();
    await telegramApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: result.published ? 'Опубликовано 🚀' : result.error ?? 'Очередь пуста или рано',
      show_alert: !result.published,
    });
  }
}

export async function handleTelegramBotUpdate(update: Record<string, unknown>): Promise<void> {
  const cb = update.callback_query as
    | { id?: string; data?: string; message?: { chat?: { id?: number } } }
    | undefined;
  if (cb?.data && cb.id) {
    const chatId = String(cb.message?.chat?.id ?? '');
    await handleCallback(cb.data, cb.id, chatId);
  }
}

export function verifyTelegramWebhookSecret(header: string | undefined): boolean {
  const secret = WEBHOOK_SECRET();
  if (!secret) return true;
  return header === secret;
}

export async function ensureTelegramAdminWebhook(): Promise<void> {
  const token = BOT_TOKEN();
  const base = process.env.PUBLIC_BFF_URL?.trim() || process.env.SITE_URL?.trim();
  if (!token || !base || !ADMIN_CHAT()) return;

  const url = `${base.replace(/\/$/, '')}/v1/public/telegram/bot-webhook`;
  const body: Record<string, unknown> = { url, allowed_updates: ['callback_query'] };
  if (WEBHOOK_SECRET()) body.secret_token = WEBHOOK_SECRET();

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) console.log(`[telegram-admin-bot] webhook → ${url}`);
    else console.warn('[telegram-admin-bot] setWebhook failed:', (await res.text()).slice(0, 200));
  } catch (err) {
    console.warn('[telegram-admin-bot] setWebhook error:', err instanceof Error ? err.message : err);
  }
}

export function listConfiguredSocialDestinations(): Array<{ id: string; label: string; configured: boolean }> {
  const postiz = parsePostizIntegrations();
  return [
    { id: 'telegram_channel', label: 'Telegram-канал', configured: isTelegramChannelPublishConfigured() },
    { id: 'vk_wall', label: 'VK группа (стена)', configured: isVkWallPublishConfigured() },
    { id: 'bluesky', label: 'Bluesky', configured: isBlueskyPublishConfigured() },
    { id: 'mastodon', label: 'Mastodon', configured: isMastodonPublishConfigured() },
    {
      id: 'postiz',
      label: `Postiz → X/Threads/LinkedIn/IG (${postiz.length})`,
      configured: isPostizPublishConfigured(),
    },
  ];
}
