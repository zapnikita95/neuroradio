import crypto from 'node:crypto';
import fetch from 'node-fetch';
import { getSaluteHttpsAgent } from './salute-http.js';

const OAUTH_URL = 'https://ngw.devices.sber.ru:9443/api/v2/oauth';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let cache: TokenCache | null = null;

export function getSaluteAuthKey(): string {
  const direct = process.env.SALUTE_SPEECH_AUTH_KEY?.trim();
  if (direct) return direct;

  const clientId = process.env.SALUTE_SPEECH_CLIENT_ID?.trim();
  const clientSecret = process.env.SALUTE_SPEECH_CLIENT_SECRET?.trim();
  if (clientId && clientSecret) {
    return Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  }
  return '';
}

export function hasSaluteSpeechCredentials(): boolean {
  return Boolean(getSaluteAuthKey());
}

export function getSaluteScope(): string {
  return process.env.SALUTE_SPEECH_SCOPE?.trim() || 'SALUTE_SPEECH_PERS';
}

export async function getSaluteAccessToken(authKeyOverride?: string): Promise<string> {
  const authKey = authKeyOverride?.trim() || getSaluteAuthKey();
  if (!authKey) {
    throw new Error('SALUTE_SPEECH_AUTH_KEY or CLIENT_ID+CLIENT_SECRET required');
  }

  const now = Date.now();
  if (!authKeyOverride && cache && cache.expiresAt > now + 60_000) {
    return cache.accessToken;
  }

  const rqUid = crypto.randomUUID();
  const scope = getSaluteScope();

  const response = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${authKey}`,
      RqUID: rqUid,
      Accept: 'application/json',
    },
    body: `scope=${encodeURIComponent(scope)}`,
    agent: getSaluteHttpsAgent() as import('node:http').Agent | undefined,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SaluteSpeech OAuth error ${response.status}: ${body.slice(0, 280)}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error('SaluteSpeech OAuth: missing access_token');
  }

  const expiresInSec = typeof data.expires_in === 'number' ? data.expires_in : 1800;
  if (!authKeyOverride) {
    cache = {
      accessToken: data.access_token,
      expiresAt: now + expiresInSec * 1000,
    };
  }

  return data.access_token;
}
