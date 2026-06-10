import type { HarvestContext, HarvestedFact } from './types.js';
import { cleanTrackTitle, fetchText, splitSentences, stripHtml } from './fetch-utils.js';

export async function fetchWhoSampledFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const slug = `${ctx.artist}-${cleanTrackTitle(ctx.title)}`
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug || slug.length < 4) return [];

  const url = `https://www.whosampled.com/search/?q=${encodeURIComponent(`${ctx.artist} ${cleanTrackTitle(ctx.title)}`)}`;
  const html = await fetchText(url, { timeoutMs: 10000 });
  if (!html) return [];

  const linkMatch = html.match(/href="(\/[^"]+\/[^"]+\/[^"]+\/)"/i);
  if (!linkMatch?.[1]) return [];

  const page = await fetchText(`https://www.whosampled.com${linkMatch[1]}`, { timeoutMs: 10000 });
  if (!page) return [];

  const facts: HarvestedFact[] = [];
  const sampleBlocks = page.matchAll(
    /class="[^"]*sample[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|p)>/gi,
  );
  for (const block of sampleBlocks) {
    const text = stripHtml(block[1] ?? '');
    if (text.length < 35) continue;
    facts.push({ fact: text, scope: 'track', source: 'whosampled' });
  }

  if (facts.length === 0) {
    const desc = stripHtml(
      page.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] ?? '',
    );
    if (desc.length >= 35) {
      facts.push({ fact: desc, scope: 'track', source: 'whosampled' });
    }
  }
  return facts.slice(0, 4);
}
