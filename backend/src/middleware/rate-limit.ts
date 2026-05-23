import { Request, Response, NextFunction } from 'express';
import { SECURITY } from '../config/security.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MINUTE_MS = 60_000;

function clientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
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

function enforce(key: string, max: number, windowMs: number, res: Response, message: string): boolean {
  if (checkLimit(key, max, windowMs)) return true;
  res.status(429).json({ error: message });
  return false;
}

/** Prevent unbounded memory growth on long-running Railway instances. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}, 5 * MINUTE_MS).unref();

export function rateLimitAuth(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const installId = typeof req.body?.install_id === 'string' ? req.body.install_id.trim() : '';
  const { limits } = SECURITY;

  if (!enforce(`auth:ip:min:${ip}`, limits.authPerIpPerMinute, MINUTE_MS, res, 'Too many auth attempts')) return;
  if (!enforce(`auth:ip:day:${ip}`, limits.authPerIpPerDay, DAY_MS, res, 'Daily auth limit reached')) return;
  if (installId && !enforce(`auth:install:day:${installId}`, limits.authPerInstallPerDay, DAY_MS, res, 'Daily token limit reached')) return;

  next();
}

export function rateLimitHealth(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  if (!enforce(`health:ip:min:${ip}`, SECURITY.limits.healthPerIpPerMinute, MINUTE_MS, res, 'Too many requests')) return;
  next();
}

export function rateLimitStory(installId: string): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = clientIp(req);
    const { limits } = SECURITY;

    if (!enforce(`ip:hour:${ip}`, limits.ipGlobalPerHour, HOUR_MS, res, 'Too many requests from this network')) return;
    if (!enforce(`story:burst:${installId}`, limits.storyBurstPerInstallPerMinute, MINUTE_MS, res, 'Slow down — story generation is rate limited')) return;
    if (!enforce(`story:hour:${installId}`, limits.storyPerInstallPerHour, HOUR_MS, res, 'Hourly story limit reached')) return;
    if (!enforce(`story:day:${installId}`, limits.storyPerInstallPerDay, DAY_MS, res, 'Daily story limit reached')) return;

    next();
  };
}
