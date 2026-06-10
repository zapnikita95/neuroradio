import type { HarvestContext, HarvestedFact } from './types.js';
import { cleanTrackTitle, fetchText, splitSentences, stripHtml } from './fetch-utils.js';

export async function fetchSongfactsFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const query = `${ctx.artist} ${cleanTrackTitle(ctx.title)}`.trim();
  const searchUrl = `https://www.songfacts.com/search/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(searchUrl, { timeoutMs: 10000 });
  if (!html) return [];

  const linkMatch = html.match(/href="(\/facts\/[^"]+)"/i);
  if (!linkMatch?.[1]) return [];

  const page = await fetchText(`https://www.songfacts.com${linkMatch[1]}`, { timeoutMs: 10000 });
  if (!page) return [];

  const facts: HarvestedFact[] = [];
  const factBlocks = page.matchAll(
    /<div[^>]*class="[^"]*fact[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  );
  for (const block of factBlocks) {
    const text = stripHtml(block[1] ?? '');
    if (text.length < 35) continue;
    for (const sentence of splitSentences(text)) {
      facts.push({ fact: sentence, scope: 'track', source: 'songfacts' });
    }
  }

  if (facts.length === 0) {
    const main = stripHtml(
      page.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
        page.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
        page,
    );
    for (const sentence of splitSentences(main).slice(0, 4)) {
      facts.push({ fact: sentence, scope: 'track', source: 'songfacts' });
    }
  }
  return facts.slice(0, 5);
}
