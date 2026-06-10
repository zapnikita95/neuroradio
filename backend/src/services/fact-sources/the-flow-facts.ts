import type { HarvestContext, HarvestedFact } from './types.js';
import { fetchText, isCyrillic, splitSentences, stripHtml } from './fetch-utils.js';

export async function fetchTheFlowFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  if (!isCyrillic(ctx.artist + ctx.title)) return [];

  const query = `${ctx.artist} ${ctx.title}`;
  const searchUrl = `https://the-flow.ru/search?query=${encodeURIComponent(query)}`;
  const html = await fetchText(searchUrl, { timeoutMs: 10000 });
  if (!html) return [];

  const linkMatch = html.match(/href="(\/news\/[^"]+)"/i) ?? html.match(/href="(\/[^"]+\/[^"]+)"/i);
  if (!linkMatch?.[1]) return [];

  const pageUrl = linkMatch[1].startsWith('http')
    ? linkMatch[1]
    : `https://the-flow.ru${linkMatch[1]}`;
  const page = await fetchText(pageUrl, { timeoutMs: 10000 });
  if (!page) return [];

  const article =
    page.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    page.match(/<div[^>]*class="[^"]*post[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[0] ??
    page;
  const text = stripHtml(article);
  const facts: HarvestedFact[] = [];
  for (const sentence of splitSentences(text)) {
    if (
      sentence.toLowerCase().includes(ctx.artist.toLowerCase()) ||
      sentence.toLowerCase().includes(ctx.title.toLowerCase())
    ) {
      facts.push({ fact: sentence, scope: 'track', source: 'the-flow' });
    }
  }
  return facts.slice(0, 4);
}
