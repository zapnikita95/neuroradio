import fetch from 'node-fetch';

export const HARVEST_USER_AGENT =
  'Mozilla/5.0 (compatible; MusicStoryBFF/1.0; +https://efir-ai.ru)';

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

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35);
}

export function cleanTrackTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

export async function fetchText(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': HARVEST_USER_AGENT,
        Accept: 'text/html,application/json,*/*',
        ...opts.headers,
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export async function fetchJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': HARVEST_USER_AGENT,
        Accept: 'application/json',
        ...opts.headers,
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
