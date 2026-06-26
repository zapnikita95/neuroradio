import { sendTelegramAdminMessage, isTelegramAdminNotifyConfigured } from './telegram-admin-notify.js';
import type { StoryFeedbackEntry } from './story-feedback.js';

const MAX_PER_INSTALL_DAY = parseInt(process.env.FEEDBACK_BORING_NOTIFY_MAX_PER_DAY ?? '3', 10);
const TRACK_COOLDOWN_MS = parseInt(process.env.FEEDBACK_BORING_NOTIFY_TRACK_COOLDOWN_MS ?? String(6 * 60 * 60_000), 10);
const GLOBAL_MIN_GAP_MS = parseInt(process.env.FEEDBACK_BORING_NOTIFY_GLOBAL_GAP_MS ?? '15000', 10);

const installTimestamps = new Map<string, number[]>();
const trackLastNotify = new Map<string, number>();
let lastGlobalNotify = 0;

function trackKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

/** Drop spammy boring_fact taps (same track flood, install rage-taps). */
export function shouldNotifyAdminBoringFeedback(installId: string, artist: string, title: string): boolean {
  const now = Date.now();
  const dayMs = 24 * 60 * 60_000;

  if (now - lastGlobalNotify < GLOBAL_MIN_GAP_MS) return false;

  const tk = trackKey(artist, title);
  const lastTrack = trackLastNotify.get(tk) ?? 0;
  if (now - lastTrack < TRACK_COOLDOWN_MS) return false;

  const prev = installTimestamps.get(installId) ?? [];
  const recent = prev.filter((t) => now - t < dayMs);
  if (recent.length >= MAX_PER_INSTALL_DAY) return false;

  installTimestamps.set(installId, [...recent, now]);
  trackLastNotify.set(tk, now);
  lastGlobalNotify = now;
  return true;
}

export async function notifyAdminBoringFeedback(
  entry: StoryFeedbackEntry,
  seedFact?: string,
): Promise<void> {
  if (!isTelegramAdminNotifyConfigured()) return;
  if (!shouldNotifyAdminBoringFeedback(entry.installId, entry.artist, entry.title)) {
    console.log(
      `[feedback-admin] boring notify suppressed install=${entry.installId.slice(0, 8)} ` +
        `"${entry.artist}" — "${entry.title}"`,
    );
    return;
  }
  const factLine = seedFact?.trim()
    ? `\nФакт: ${seedFact.trim().slice(0, 200)}${seedFact.length > 200 ? '…' : ''}`
    : '';
  await sendTelegramAdminMessage(
    `👎 Скучный факт\n` +
      `${entry.artist} — ${entry.title}\n` +
      `install: ${entry.installId.slice(0, 8)}…${factLine}\n` +
      `→ попадёт в weekly deep enrich`,
  );
}
