import {
  formatTelegramPost,
  formatVkPost,
  markSocialFailed,
  markSocialPublished,
  pickNextApprovedForPublish,
} from './social-publish-queue.js';
import { publishToTelegramChannel, isTelegramChannelPublishConfigured } from './telegram-channel-publish.js';
import { publishToVkWall, isVkWallPublishConfigured } from './vk-wall-publish.js';
import { markPublicFactsPublished } from './public-voiced-facts.js';

export function isSocialPublishEnabled(): boolean {
  return process.env.SOCIAL_PUBLISH_ENABLED?.trim() === 'true';
}

export async function runSocialPublishTick(): Promise<{ published: boolean; id?: string; error?: string }> {
  if (!isSocialPublishEnabled()) {
    return { published: false, error: 'disabled' };
  }

  const item = pickNextApprovedForPublish();
  if (!item) return { published: false };

  let tgId: number | null = null;
  let vkId: number | null = null;
  const errors: string[] = [];

  if (isTelegramChannelPublishConfigured()) {
    try {
      tgId = await publishToTelegramChannel(formatTelegramPost(item));
    } catch (err) {
      errors.push(`telegram: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (isVkWallPublishConfigured()) {
    try {
      vkId = await publishToVkWall(formatVkPost(item));
    } catch (err) {
      errors.push(`vk: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (tgId == null && vkId == null) {
    const msg =
      errors.join('; ') ||
      'no publishers configured (set TELEGRAM_CHANNEL_ID and/or VK_ACCESS_TOKEN+VK_GROUP_ID)';
    markSocialFailed(item.id, msg);
    return { published: false, id: item.id, error: msg };
  }

  markSocialPublished(item.id, {
    telegramMessageId: tgId ?? undefined,
    vkPostId: vkId ?? undefined,
  });
  markPublicFactsPublished([item.publicFactId]);
  console.log(
    `[social-publish] ok id=${item.id} tg=${tgId ?? '-'} vk=${vkId ?? '-'} "${item.artist}" — "${item.title}"`,
  );
  return { published: true, id: item.id };
}

let socialPublishTimer: ReturnType<typeof setInterval> | null = null;

export function startSocialPublishScheduler(): void {
  if (!isSocialPublishEnabled()) return;
  const minutes = parseInt(process.env.SOCIAL_PUBLISH_CRON_MINUTES ?? '360', 10);
  const ms = Math.max(15, minutes) * 60_000;
  if (socialPublishTimer) clearInterval(socialPublishTimer);
  socialPublishTimer = setInterval(() => {
    void runSocialPublishTick().catch((err) =>
      console.warn('[social-publish] tick error:', err instanceof Error ? err.message : err),
    );
  }, ms);
  console.log(`[social-publish] scheduler every ${minutes} min`);
  void runSocialPublishTick();
}
