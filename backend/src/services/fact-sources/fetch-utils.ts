import fetch from '../../proxy-fetch.js';
import { acquireHarvestSlot, penalizeHarvestBucket } from '../harvest-rate-limiter.js';

export const HARVEST_USER_AGENT =
  'Mozilla/5.0 (compatible; MusicStoryBFF/1.0; +https://efir-ai.ru)';

const MAX_429_RETRIES = 3;

export function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Genius API v2 — description/body as nested DOM nodes instead of plain text. */
export function domToPlainText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const obj = node as { children?: unknown[] };
  if (!Array.isArray(obj.children)) return '';
  return obj.children.map(domToPlainText).join('');
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35);
}

import { cleanTrackTitleForSearch } from '../title-clean.js';
import { primaryHarvestLookupTitle } from '../title-harvest-variants.js';

export function cleanTrackTitle(title: string): string {
  const harvest = primaryHarvestLookupTitle(title);
  return cleanTrackTitleForSearch(harvest);
}

export function isCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

async function fetchWithRateLimit(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; accept?: string },
): Promise<Response | null> {
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    await acquireHarvestSlot(url);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': HARVEST_USER_AGENT,
          Accept: opts.accept ?? 'application/json,*/*',
          ...opts.headers,
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      });
      if (response.status === 429 && attempt < MAX_429_RETRIES) {
        await penalizeHarvestBucket(url, attempt + 1);
        continue;
      }
      return response;
    } catch {
      if (attempt < MAX_429_RETRIES) {
        await penalizeHarvestBucket(url, attempt + 1);
        continue;
      }
      return null;
    }
  }
  return null;
}

export async function fetchText(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<string | null> {
  const response = await fetchWithRateLimit(url, {
    ...opts,
    accept: 'text/html,application/json,*/*',
  });
  if (!response?.ok) return null;
  try {
    return await response.text();
  } catch {
    return null;
  }
}

export async function fetchJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T | null> {
  const response = await fetchWithRateLimit(url, { ...opts, accept: 'application/json' });
  if (!response?.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
