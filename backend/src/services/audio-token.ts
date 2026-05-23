import crypto from 'node:crypto';
import { getAuthJwtSecret } from './jwt.js';
import { SECURITY } from '../config/security.js';

export function signAudioAccess(fileName: string): string | null {
  const secret = getAuthJwtSecret();
  if (!secret) return null;

  const safeName = pathBasename(fileName);
  const exp = Math.floor(Date.now() / 1000) + SECURITY.audioUrlTtlSec;
  const sig = crypto.createHmac('sha256', secret).update(`${safeName}:${exp}`).digest('hex');
  return `/audio/${safeName}?exp=${exp}&sig=${sig}`;
}

export function verifyAudioAccess(fileName: string, expRaw: string | undefined, sigRaw: string | undefined): boolean {
  const secret = getAuthJwtSecret();
  if (!secret) return true;

  const safeName = pathBasename(fileName);
  const exp = parseInt(expRaw ?? '', 10);
  const sig = sigRaw?.trim();
  if (!sig || Number.isNaN(exp)) return false;
  if (exp < Math.floor(Date.now() / 1000)) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${safeName}:${exp}`).digest('hex');
  const sigBuffer = Buffer.from(sig, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

function pathBasename(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  if (!/^[a-zA-Z0-9._-]+\.ogg$/.test(base)) {
    throw new Error('Invalid audio file name');
  }
  return base;
}

export { pathBasename as safeAudioFileName };
