import { Response } from 'express';
import { isUnlimitedInstall, SECURITY } from '../config/security.js';

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

function checkLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxRequests) return false;
  bucket.count += 1;
  return true;
}

function sendLimitError(
  res: Response,
  message: string,
  code: string,
  quota: QuotaSnapshot,
): void {
  res.status(429).json({
    error: message,
    code,
    quota,
  });
}

function enforce(
  key: string,
  max: number,
  windowMs: number,
  res: Response,
  message: string,
  code: string,
): boolean {
  if (checkLimit(key, max, windowMs)) return true;
  sendLimitError(res, message, code, peekUsage(key, max, windowMs));
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
};

export function getDailyStoryQuota(installId: string): QuotaSnapshot {
  if (isUnlimitedInstall(installId)) return { ...UNLIMITED_QUOTA, resetsAt: Date.now() + DAY_MS };
  return peekUsage(
    `story:day:${installId}`,
    SECURITY.limits.storyPerInstallPerDay,
    DAY_MS,
  );
}

export function attachStoryQuotaHeaders(res: Response, installId: string): void {
  const quota = getDailyStoryQuota(installId);
  res.setHeader('X-Story-Quota-Limit', String(quota.limit));
  res.setHeader('X-Story-Quota-Remaining', String(quota.remaining));
  res.setHeader('X-Story-Quota-Resets-At', String(quota.resetsAt));
}

export function clientIp(req: { header(name: string): string | undefined; socket: { remoteAddress?: string } }): string {
  return clientIpFromForwarded(req.header('x-forwarded-for'), req.socket.remoteAddress);
}

export function rateLimitAuth(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void {
  const ip = clientIp(req);
  const installId = typeof req.body?.install_id === 'string' ? req.body.install_id.trim() : '';
  const { limits } = SECURITY;

  if (!enforce(`auth:ip:min:${ip}`, limits.authPerIpPerMinute, MINUTE_MS, res, 'Too many auth attempts', 'AUTH_RATE')) return;
  if (!enforce(`auth:ip:day:${ip}`, limits.authPerIpPerDay, DAY_MS, res, 'Daily auth limit reached', 'AUTH_DAILY')) return;
  if (installId && !enforce(`auth:install:day:${installId}`, limits.authPerInstallPerDay, DAY_MS, res, 'Daily token limit reached', 'AUTH_INSTALL_DAILY')) return;

  next();
}

export function rateLimitHealth(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void {
  const ip = clientIp(req);
  if (!enforce(`health:ip:min:${ip}`, SECURITY.limits.healthPerIpPerMinute, MINUTE_MS, res, 'Too many requests', 'HEALTH_RATE')) return;
  next();
}

export function rateLimitStory(installId: string): (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void {
  return (req, res, next) => {
    if (isUnlimitedInstall(installId)) {
      next();
      return;
    }

    const ip = clientIp(req);
    const { limits } = SECURITY;
    const dailyLimit = limits.storyPerInstallPerDay;

    if (!enforce(`ip:hour:${ip}`, limits.ipGlobalPerHour, HOUR_MS, res, 'Too many requests from this network', 'IP_HOURLY')) return;
    if (!enforce(`story:burst:${installId}`, limits.storyBurstPerInstallPerMinute, MINUTE_MS, res, 'Slow down — story generation is rate limited', 'STORY_BURST')) return;
    if (!enforce(`story:hour:${installId}`, limits.storyPerInstallPerHour, HOUR_MS, res, 'Hourly story limit reached', 'STORY_HOURLY')) return;
    if (!enforce(
      `story:day:${installId}`,
      dailyLimit,
      DAY_MS,
      res,
      `Бесплатный лимит: ${dailyLimit} историй в день. Добавь свой Groq-ключ в настройках — без ограничений.`,
      'DAILY_LIMIT',
    )) return;

    next();
  };
}
