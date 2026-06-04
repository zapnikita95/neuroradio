import crypto from 'node:crypto';

export interface TelegramAuthPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export function verifyTelegramLogin(payload: TelegramAuthPayload, botToken: string): boolean {
  const { hash, ...rest } = payload;
  if (!hash || !botToken) return false;

  const authAgeSec = Math.floor(Date.now() / 1000) - payload.auth_date;
  if (authAgeSec > 86400 || authAgeSec < -60) return false;

  const dataCheckString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${(rest as Record<string, string | number | undefined>)[key]}`)
    .join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return computed === hash;
}
