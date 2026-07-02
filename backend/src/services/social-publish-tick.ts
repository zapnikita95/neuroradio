import {
  formatTelegramPost,
  formatVkPost,
  markSocialFailed,
  markSocialPublished,
  pickNextApprovedForPublish,
} from './social-publish-queue.js';
import {
  publishToTelegramChannel,
  publishVideoToTelegramChannel,
  isTelegramChannelPublishConfigured,
} from './telegram-channel-publish.js';
import { publishToVkWall, isVkWallPublishConfigured } from './vk-wall-publish.js';
import { publishToBluesky, isBlueskyPublishConfigured } from './bluesky-publish.js';
import { publishToMastodon, isMastodonPublishConfigured } from './mastodon-publish.js';
import { publishViaPostiz, isPostizPublishConfigured } from './postiz-publish.js';
import { markPublicFactsPublished } from './public-voiced-facts.js';
import {
  cleanupSocialVideoFiles,
  isSocialVideoEnabled,
  renderSocialStoryVideo,
} from './social-video-render.js';

export function isSocialPublishEnabled(): boolean {
  return process.env.SOCIAL_PUBLISH_ENABLED?.trim() === 'true';
}

export async function runSocialPublishTick(): Promise<{ published: boolean; id?: string; error?: string }> {
  if (!isSocialPublishEnabled()) {
    return { published: false, error: 'disabled' };
  }

  const item = pickNextApprovedForPublish();
  if (!item) return { published: false };

  let videoPath: string | null = null;
  if (isSocialVideoEnabled()) {
    videoPath = await renderSocialStoryVideo({
      artist: item.artist,
      title: item.title,
      voicedText: item.voicedText,
      narrator: item.narrator,
      lang: item.lang,
      jobId: item.id,
    });
  }

  const tgCaption = formatTelegramPost(item);
  const vkText = formatVkPost(item);
  const shortText = `🎵 ${item.title} — ${item.artist}\n\n${item.voicedText.slice(0, 280)}…\n\nhttps://www.efir-ai.ru`;

  let tgId: number | null = null;
  let vkId: number | null = null;
  let blueskyUri: string | null = null;
  let mastodonUrl: string | null = null;
  let postizIds: string[] = [];
  const errors: string[] = [];
  let successCount = 0;

  if (isTelegramChannelPublishConfigured()) {
    try {
      if (videoPath) {
        tgId = await publishVideoToTelegramChannel(videoPath, tgCaption);
      }
      if (tgId == null) {
        tgId = await publishToTelegramChannel(tgCaption);
      }
      if (tgId != null) successCount++;
    } catch (err) {
      errors.push(`telegram: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (isVkWallPublishConfigured()) {
    try {
      vkId = await publishToVkWall(vkText);
      if (vkId != null) successCount++;
    } catch (err) {
      errors.push(`vk: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (isBlueskyPublishConfigured()) {
    try {
      blueskyUri = await publishToBluesky(shortText);
      if (blueskyUri) successCount++;
    } catch (err) {
      errors.push(`bluesky: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (isMastodonPublishConfigured()) {
    try {
      mastodonUrl = await publishToMastodon(shortText);
      if (mastodonUrl) successCount++;
    } catch (err) {
      errors.push(`mastodon: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (isPostizPublishConfigured()) {
    try {
      postizIds = await publishViaPostiz(tgCaption, videoPath);
      if (postizIds.length) successCount++;
    } catch (err) {
      errors.push(`postiz: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (videoPath) cleanupSocialVideoFiles(item.id);

  if (successCount === 0) {
    const msg =
      errors.join('; ') ||
      'no publishers configured — set TELEGRAM_CHANNEL_ID, VK_*, BLUESKY_*, MASTODON_*, or POSTIZ_*';
    markSocialFailed(item.id, msg);
    return { published: false, id: item.id, error: msg };
  }

  markSocialPublished(item.id, {
    telegramMessageId: tgId ?? undefined,
    vkPostId: vkId ?? undefined,
    blueskyUri: blueskyUri ?? undefined,
    mastodonUrl: mastodonUrl ?? undefined,
    postizPostIds: postizIds.length ? postizIds : undefined,
  });
  markPublicFactsPublished([item.publicFactId]);
  console.log(
    `[social-publish] ok id=${item.id} targets=${successCount} tg=${tgId ?? '-'} vk=${vkId ?? '-'} bs=${blueskyUri ? 'y' : '-'} md=${mastodonUrl ? 'y' : '-'} postiz=${postizIds.length}`,
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
