import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StoryLanguageId } from './story-language.js';
import type { StoryNarratorId } from './story-narrator.js';
import { publicVoicedFactDedupeKey } from './public-voiced-facts.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const QUEUE_PATH = path.join(DATA_DIR, 'social-publish-queue.json');

export type SocialPublishStatus =
  | 'candidate'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed';

export type SocialPublishSource = 'triple_like' | 'gold' | 'manual';

export interface SocialPublishQueueItem {
  id: string;
  publicFactId: string;
  artist: string;
  title: string;
  voicedText: string;
  narrator: StoryNarratorId;
  lang: StoryLanguageId;
  source: SocialPublishSource;
  status: SocialPublishStatus;
  createdAt: number;
  approvedAt?: number;
  scheduledAt?: number;
  publishedAt?: number;
  lastError?: string;
  telegramMessageId?: number;
  vkPostId?: number;
}

interface SocialPublishQueueFile {
  updatedAt: number;
  items: SocialPublishQueueItem[];
}

const PUBLISH_COOLDOWN_MS = parseInt(process.env.SOCIAL_PUBLISH_COOLDOWN_MS ?? `${180 * 24 * 3600_000}`, 10);
const MAX_QUEUE = parseInt(process.env.SOCIAL_PUBLISH_MAX_QUEUE ?? '500', 10);

function loadQueue(): SocialPublishQueueFile {
  if (!fs.existsSync(QUEUE_PATH)) return { updatedAt: Date.now(), items: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')) as SocialPublishQueueFile;
    return { updatedAt: raw.updatedAt ?? Date.now(), items: Array.isArray(raw.items) ? raw.items : [] };
  } catch {
    return { updatedAt: Date.now(), items: [] };
  }
}

function saveQueue(file: SocialPublishQueueFile): void {
  fs.mkdirSync(path.dirname(QUEUE_PATH), { recursive: true });
  file.updatedAt = Date.now();
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(file, null, 2), 'utf8');
}

export function enqueueSocialPublishCandidate(input: {
  publicFactId: string;
  artist: string;
  title: string;
  voicedText: string;
  narrator: StoryNarratorId;
  lang: StoryLanguageId;
  source: SocialPublishSource;
}): SocialPublishQueueItem | null {
  const file = loadQueue();
  const dedupe = publicVoicedFactDedupeKey(
    input.voicedText,
    input.artist,
    input.title,
    input.narrator,
  );

  const recentPublished = file.items.find(
    (i) =>
      i.status === 'published' &&
      publicVoicedFactDedupeKey(i.voicedText, i.artist, i.title, i.narrator) === dedupe &&
      Date.now() - (i.publishedAt ?? 0) < PUBLISH_COOLDOWN_MS,
  );
  if (recentPublished) return null;

  const existing = file.items.find(
    (i) =>
      i.status !== 'failed' &&
      publicVoicedFactDedupeKey(i.voicedText, i.artist, i.title, i.narrator) === dedupe,
  );
  if (existing) return existing;

  if (file.items.length >= MAX_QUEUE) {
    file.items = file.items.filter((i) => i.status !== 'published').slice(-MAX_QUEUE + 1);
  }

  const autoApprove = process.env.SOCIAL_AUTO_APPROVE?.trim() === 'true';
  const item: SocialPublishQueueItem = {
    id: crypto.randomUUID(),
    publicFactId: input.publicFactId,
    artist: input.artist,
    title: input.title,
    voicedText: input.voicedText,
    narrator: input.narrator,
    lang: input.lang,
    source: input.source,
    status: autoApprove ? 'approved' : 'candidate',
    createdAt: Date.now(),
    approvedAt: autoApprove ? Date.now() : undefined,
  };
  file.items.push(item);
  saveQueue(file);
  console.log(`[social-queue] +candidate id=${item.id} source=${item.source} status=${item.status}`);
  return item;
}

export function approveSocialPublishItem(id: string): SocialPublishQueueItem | null {
  const file = loadQueue();
  const item = file.items.find((i) => i.id === id);
  if (!item || item.status === 'published') return null;
  item.status = 'approved';
  item.approvedAt = Date.now();
  saveQueue(file);
  return item;
}

export function listSocialPublishQueue(status?: SocialPublishStatus): SocialPublishQueueItem[] {
  const items = loadQueue().items.sort((a, b) => b.createdAt - a.createdAt);
  if (!status) return items;
  return items.filter((i) => i.status === status);
}

export function pickNextApprovedForPublish(): SocialPublishQueueItem | null {
  const file = loadQueue();
  const minGapMs = parseInt(process.env.SOCIAL_MIN_PUBLISH_GAP_MS ?? `${48 * 3600_000}`, 10);
  const lastPub = file.items
    .filter((i) => i.status === 'published' && i.publishedAt)
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))[0];
  if (lastPub?.publishedAt && Date.now() - lastPub.publishedAt < minGapMs) return null;

  const item = file.items
    .filter((i) => i.status === 'approved' || i.status === 'scheduled')
    .sort((a, b) => (a.approvedAt ?? a.createdAt) - (b.approvedAt ?? b.createdAt))[0];
  return item ?? null;
}

export function markSocialPublished(
  id: string,
  patch: Partial<Pick<SocialPublishQueueItem, 'telegramMessageId' | 'vkPostId'>>,
): void {
  const file = loadQueue();
  const item = file.items.find((i) => i.id === id);
  if (!item) return;
  item.status = 'published';
  item.publishedAt = Date.now();
  if (patch.telegramMessageId != null) item.telegramMessageId = patch.telegramMessageId;
  if (patch.vkPostId != null) item.vkPostId = patch.vkPostId;
  saveQueue(file);
}

export function markSocialFailed(id: string, error: string): void {
  const file = loadQueue();
  const item = file.items.find((i) => i.id === id);
  if (!item) return;
  item.status = 'failed';
  item.lastError = error.slice(0, 500);
  saveQueue(file);
}

export const SOCIAL_PUBLISH_QUEUE_PATH = QUEUE_PATH;

export function formatTelegramPost(item: SocialPublishQueueItem): string {
  const excerpt =
    item.voicedText.length > 900 ? `${item.voicedText.slice(0, 897).trim()}…` : item.voicedText;
  return (
    `🎵 ${item.title} — ${item.artist}\n\n` +
    `${excerpt}\n\n` +
    `— Эфир AI · факт озвучен в эфире\n` +
    `https://www.efir-ai.ru/docs/facts/index.html`
  );
}

export function formatVkPost(item: SocialPublishQueueItem): string {
  const excerpt =
    item.voicedText.length > 1200 ? `${item.voicedText.slice(0, 1197).trim()}…` : item.voicedText;
  return (
    `${item.title} — ${item.artist}\n\n` +
    `${excerpt}\n\n` +
    `Узнай факт о треке, который играет у тебя — Эфир AI\n` +
    `https://www.efir-ai.ru`
  );
}
