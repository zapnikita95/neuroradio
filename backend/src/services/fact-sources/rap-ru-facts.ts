import type { HarvestContext, HarvestedFact } from './types.js';
import { fetchText, isCyrillic, splitSentences, stripHtml } from './fetch-utils.js';

export async function fetchRapRuFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  if (!isCyrillic(ctx.artist + ctx.title)) return [];

  const query = `${ctx.artist} ${ctx.title}`;
  const searchUrl = `https://rap.ru/search?q=${encodeURIComponent(query)}`;
  const html = await fetchText(searchUrl, { timeoutMs: 10000 });
  if (!html) return [];

  const linkMatch = html.match(/href="(\/news\/[^"]+)"/i) ?? html.match(/href="(\/articles\/[^"]+)"/i);
  if (!linkMatch?.[1]) return [];

  const page = await fetchText(`https://rap.ru${linkMatch[1]}`, { timeoutMs: 10000 });
  if (!page) return [];

  const article =
    page.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    page.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[0] ??
    page;
  const text = stripHtml(article);
  const facts: HarvestedFact[] = [];
  for (const sentence of splitSentences(text)) {
    if (
      sentence.toLowerCase().includes(ctx.artist.toLowerCase()) ||
      sentence.toLowerCase().includes(ctx.title.toLowerCase())
    ) {
      facts.push({ fact: sentence, scope: 'track', source: 'rap-ru' });
    }
  }
  return facts.slice(0, 4);
}
