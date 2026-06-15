import { Response } from 'express';
import { isUnlimitedInstall, SECURITY } from '../config/security.js';
import { getAccountProfile, getQuotaSubject } from '../services/account-store.js';
import { isYookassaReviewerEmail } from '../services/yookassa-reviewer-accounts.js';
import { resolveUserTier } from '../services/entitlements.js';
import { resolveFreeDailyLimit } from '../services/free-model-profile.js';
import { getDevTierOverride } from '../services/dev-tier-store.js';
import { canUseDevTierSwitch } from '../services/admin-users.js';
import { getStoryLimitsForTier } from '../services/tier-policy.js';
import { setLogDetail } from './request-logger.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
const MINUTE_MS = 60_000;

export interface QuotaSnapshot {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: number;
  tier?: string;
  monthlyUsed?: number;
  monthlyLimit?: number;
  monthlyRemaining?: number;
  monthlyResetsAt?: number;
}

function clientIpFromForwarded(forwarded?: string, remoteAddress?: string): string {
  const forwardedIp = forwarded?.split(',')[0]?.trim();
  return forwardedIp || remoteAddress || 'unknown';
}

function getBucket(key: string): Bucket | undefined {
  const bucket = buckets.get(key);
  if (!bucket) return undefined;
  if (Date.now() >= bucket.resetAt) {
    buckets.delete(key);
    return undefined;
  }
  return bucket;
}

function peekUsage(key: string, maxRequests: number, windowMs: number): QuotaSnapshot {
  const bucket = getBucket(key);
  const used = bucket?.count ?? 0;
  const resetsAt = bucket?.resetAt ?? Date.now() + windowMs;
  return {
    used,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - used),
    resetsAt,
  };
}

function wouldAllow(key: string, maxRequests: number, windowMs: number): boolean {
  const bucket = getBucket(key);
  if (!bucket) return true;
  return bucket.count < maxRequests;
}

function consumeLimit(key: string, maxRequests: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
}

function sendLimitError(
  res: Response,
  message: string,
  code: string,
  quota: QuotaSnapshot,
): void {
  console.warn(`[rate-limit] ${code} remaining=${quota.remaining}/${quota.limit}`);
  setLogDetail(res, `server_rate_limit code=${code} remaining=${quota.remaining}/${quota.limit}`);
  res.status(429).json({
    error: message,
    code,
    quota,
    source: 'server',
  });
}

function rejectIfOverLimit(
  key: string,
  max: number,
  windowMs: number,
  res: Response,
  message: string,
  code: string,
  quotaExtra: Partial<QuotaSnapshot> = {},
): boolean {
  if (wouldAllow(key, max, windowMs)) return true;
  sendLimitError(res, message, code, { ...peekUsage(key, max, windowMs), ...quotaExtra });
  return false;
}

/** Prevent unbounded memory growth on long-running Railway instances. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}, 5 * MINUTE_MS).unref();

const UNLIMITED_QUOTA: QuotaSnapshot = {
  used: 0,
  limit: 999_999,
  remaining: 999_999,
  resetsAt: Date.now() + DAY_MS,
  tier: 'unlimited',
};

function quotaKey(installId: string): string {
  return `story:day:${getQuotaSubject(installId)}`;
}

function isDevQuotaBypass(installId: string): boolean {
  if (!canUseDevTierSwitch(installId)) return false;
  const override = getDevTierOverride(installId);
  return override === 'premium' || override === 'trial';
}

/** Сброс счётчиков историй (кнопка «Сброс» / смена тест-тарифа). */
export function resetStoryQuotaForInstall(installId: string): void {
  const subject = getQuotaSubject(installId);
  buckets.delete(quotaKey(installId));
  buckets.delete(`story:burst:${subject}`);
  buckets.delete(`story:hour:${subject}`);
}

function isReviewerInstall(installId: string): boolean {
  const email = getAccountProfile(installId).email;
  return Boolean(email && isYookassaReviewerEmail(email));
}

export function getDailyStoryLimit(installId: string, options: { freeOpenRouterModel?: string } = {}): number {
  if (isUnlimitedInstall(installId) || isDevQuotaBypass(installId) || isReviewerInstall(installId)) {
    return UNLIMITED_QUOTA.limit;
  }
  const tier = resolveUserTier(installId);
  if (tier === 'free') {
    return resolveFreeDailyLimit(options.freeOpenRouterModel);
  }
  return getStoryLimitsForTier(tier).dailyStories;
}

function enrichQuota(installId: string, base: QuotaSnapshot): QuotaSnapshot {
  return { ...base, tier: resolveUserTier(installId) };
}

export function getDailyStoryQuota(
  installId: string,
  options: { freeOpenRouterModel?: string } = {},
): QuotaSnapshot {
  if (isUnlimitedInstall(installId) || isDevQuotaBypass(installId) || isReviewerInstall(installId)) {
    return { ...UNLIMITED_QUOTA, tier: resolveUserTier(installId), resetsAt: Date.now() + DAY_MS };
  }
  const dailyLimit = getDailyStoryLimit(installId, options);
  return enrichQuota(
    installId,
    peekUsage(quotaKey(installId), dailyLimit, DAY_MS),
  );
}

export function attachStoryQuotaHeaders(res: Response, installId: string): void {
  const quota = getDailyStoryQuota(installId);
  res.setHeader('X-Story-Quota-Limit', String(quota.limit));
  res.setHeader('X-Story-Quota-Remaining', String(quota.remaining));
  res.setHeader('X-Story-Quota-Resets-At', String(quota.resetsAt));
  if (quota.tier) res.setHeader('X-Story-Tier', quota.tier);
}

export function clientIp(req: { header(name: string): string | undefined; socket: { remoteAddress?: string } }): string {
  return clientIpFromForwarded(req.header('x-forwarded-for'), req.socket.remoteAddress);
}

export function rateLimitAuth(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void {
  const ip = clientIp(req);
  const installId = typeof req.body?.install_id === 'string' ? req.body.install_id.trim() : '';
  const { limits } = SECURITY;

  if (!rejectIfOverLimit(`auth:ip:min:${ip}`, limits.authPerIpPerMinute, MINUTE_MS, res, 'Too many auth attempts', 'AUTH_RATE')) return;
  if (!rejectIfOverLimit(`auth:ip:day:${ip}`, limits.authPerIpPerDay, DAY_MS, res, 'Daily auth limit reached', 'AUTH_DAILY')) return;
  if (installId && !rejectIfOverLimit(`auth:install:day:${installId}`, limits.authPerInstallPerDay, DAY_MS, res, 'Daily token limit reached', 'AUTH_INSTALL_DAILY')) return;

  consumeLimit(`auth:ip:min:${ip}`, limits.authPerIpPerMinute, MINUTE_MS);
  if (installId) consumeLimit(`auth:install:day:${installId}`, limits.authPerInstallPerDay, DAY_MS);
  consumeLimit(`auth:ip:day:${ip}`, limits.authPerIpPerDay, DAY_MS);

  next();
}

export function rateLimitHealth(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void {
  const ip = clientIp(req);
  if (!rejectIfOverLimit(`health:ip:min:${ip}`, SECURITY.limits.healthPerIpPerMinute, MINUTE_MS, res, 'Too many requests', 'HEALTH_RATE')) return;
  consumeLimit(`health:ip:min:${ip}`, SECURITY.limits.healthPerIpPerMinute, MINUTE_MS);
  next();
}

function dailyLimitMessage(installId: string, dailyLimit: number): string {
  const tier = resolveUserTier(installId);
  if (tier === 'free') {
    return `Бесплатно: ${dailyLimit} истории в день. Пробный период 1 ₽/мес или подписка 199 ₽/мес — больше историй и DeepSeek.`;
  }
  if (tier === 'trial') {
    return `Пробный период: не более ${dailyLimit} историй в день.`;
  }
  if (tier === 'premium') {
    return `Лимит подписки: ${dailyLimit} историй в день.`;
  }
  return `Дневной лимит: ${dailyLimit} историй.`;
}

/** Peek only — does not consume quota (failed LLM runs do not burn tier). */
export function rateLimitStory(
  installId: string,
  options: { skipDailyQuota?: boolean; freeOpenRouterModel?: string } = {},
): (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void {
  return (req, res, next) => {
    if (isUnlimitedInstall(installId) || options.skipDailyQuota || isDevQuotaBypass(installId)) {
      next();
      return;
    }

    const ip = clientIp(req);
    const { limits } = SECURITY;
    const dailyLimit = getDailyStoryLimit(installId, {
      freeOpenRouterModel: options.freeOpenRouterModel,
    });
    const subject = getQuotaSubject(installId);
    const quotaBase = enrichQuota(installId, peekUsage(quotaKey(installId), dailyLimit, DAY_MS));

    if (!rejectIfOverLimit(`ip:hour:${ip}`, limits.ipGlobalPerHour, HOUR_MS, res, 'Too many requests from this network', 'IP_HOURLY', quotaBase)) return;
    if (!rejectIfOverLimit(`story:burst:${subject}`, limits.storyBurstPerInstallPerMinute, MINUTE_MS, res, 'Подожди минуту — слишком частые запросы историй', 'STORY_BURST', quotaBase)) return;
    if (!rejectIfOverLimit(`story:hour:${subject}`, limits.storyPerInstallPerHour, HOUR_MS, res, 'Hourly story limit reached', 'STORY_HOURLY', quotaBase)) return;
    if (!rejectIfOverLimit(
      quotaKey(installId),
      dailyLimit,
      DAY_MS,
      res,
      dailyLimitMessage(installId, dailyLimit),
      'DAILY_LIMIT',
      quotaBase,
    )) return;

    next();
  };
}

/** Call once after a story was successfully generated and sent to the client. */
export function recordStoryGeneration(
  installId: string,
  req: { header(name: string): string | undefined; socket: { remoteAddress?: string } },
  options: { freeOpenRouterModel?: string; skipDailyQuota?: boolean } = {},
): void {
  if (isUnlimitedInstall(installId) || isDevQuotaBypass(installId) || isReviewerInstall(installId) || options.skipDailyQuota) return;

  const ip = clientIp(req);
  const { limits } = SECURITY;
  const subject = getQuotaSubject(installId);
  const dailyLimit = getDailyStoryLimit(installId, options);

  consumeLimit(`ip:hour:${ip}`, limits.ipGlobalPerHour, HOUR_MS);
  consumeLimit(`story:burst:${subject}`, limits.storyBurstPerInstallPerMinute, MINUTE_MS);
  consumeLimit(`story:hour:${subject}`, limits.storyPerInstallPerHour, HOUR_MS);
  consumeLimit(quotaKey(installId), dailyLimit, DAY_MS);
}
