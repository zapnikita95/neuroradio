import fetch from '../proxy-fetch.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; MusicStoryDeepSearch/1.0; +https://efir-ai.ru)';
const JINA_READER = 'https://r.jina.ai/';

async function directFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const prevHttp = process.env.HTTP_PROXY;
  const prevHttps = process.env.HTTPS_PROXY;
  const prevUse = process.env.NODE_USE_ENV_PROXY;
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.NODE_USE_ENV_PROXY;
  try {
    return await fetch(input, init);
  } finally {
    if (prevHttp) process.env.HTTP_PROXY = prevHttp;
    if (prevHttps) process.env.HTTPS_PROXY = prevHttps;
    if (prevUse) process.env.NODE_USE_ENV_PROXY = prevUse;
  }
}

export interface ExtractedPage {
  url: string;
  title: string;
  text: string;
  /** Which extractor succeeded */
  via: 'jina' | 'direct' | 'tavily';
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split long article into numbered chunks for LLM fact-hunt. */
export function chunkPageText(text: string, chunkSize = 1100, overlap = 120): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= chunkSize) return normalized.length >= 80 ? [normalized] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const slice = normalized.slice(start, end);
      const lastPeriod = slice.lastIndexOf('. ');
      if (lastPeriod > chunkSize * 0.5) end = start + lastPeriod + 1;
    }
    const piece = normalized.slice(start, end).trim();
    if (piece.length >= 80) chunks.push(piece);
    if (end >= normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.slice(0, 12);
}

export function formatChunksWithProvenance(url: string, chunks: string[]): string[] {
  return chunks.map((c, i) => `[${url}] chunk ${i}: ${c}`);
}

/** Free article extraction via Jina Reader (no API key). */
export async function extractPageViaJina(url: string, timeoutMs = 35000): Promise<ExtractedPage | null> {
  const target = url.trim();
  if (!target.startsWith('http')) return null;
  try {
    const readerUrl = `${JINA_READER}${target}`;
    const response = await directFetch(readerUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/plain' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const raw = await response.text();
    const titleMatch = raw.match(/^Title:\s*(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? '';
    const mdMatch = raw.match(/Markdown Content:\s*\n([\s\S]+)/);
    const text = (mdMatch?.[1] ?? raw).trim();
    if (text.length < 120) return null;
    return { url: target, title, text: text.slice(0, 12000), via: 'jina' };
  } catch (err) {
    console.warn(`[page-extract] jina fail url=${target.slice(0, 60)} err=${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/** Direct HTML fetch fallback (works on simple pages). */
export async function extractPageDirect(url: string, timeoutMs = 12000): Promise<ExtractedPage | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const text = stripHtml(html);
    if (text.length < 120) return null;
    return { url, title: '', text: text.slice(0, 12000), via: 'direct' };
  } catch {
    return null;
  }
}

export async function extractPageContent(url: string): Promise<ExtractedPage | null> {
  const jina = await extractPageViaJina(url);
  if (jina) return jina;
  return extractPageDirect(url);
}

export async function extractPagesParallel(
  urls: string[],
  concurrency = 2,
): Promise<ExtractedPage[]> {
  const results: ExtractedPage[] = [];
  let idx = 0;
  async function worker() {
    while (idx < urls.length) {
      const i = idx++;
      const page = await extractPageContent(urls[i]!);
      if (page) results.push(page);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));
  return results;
}
