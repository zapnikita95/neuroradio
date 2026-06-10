import type { HarvestContext, HarvestedFact } from './types.js';
import { cleanTrackTitle, fetchText, stripHtml } from './fetch-utils.js';

export async function fetchSecondHandSongsFacts(ctx: HarvestContext): Promise<HarvestedFact[]> {
  const query = `${ctx.artist} ${cleanTrackTitle(ctx.title)}`;
  const url = `https://secondhandsongs.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchText(url, { timeoutMs: 10000 });
  if (!html) return [];

  const linkMatch = html.match(/href="(\/work\/[^"]+)"/i);
  if (!linkMatch?.[1]) return [];

  const page = await fetchText(`https://secondhandsongs.com${linkMatch[1]}`, { timeoutMs: 10000 });
  if (!page) return [];

  const facts: HarvestedFact[] = [];
  const perfRows = page.matchAll(
    /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi,
  );
  for (const row of perfRows) {
    const artist = stripHtml(row[1] ?? '');
    const detail = stripHtml(row[2] ?? '');
    if (artist.length < 2 || detail.length < 20) continue;
    const fact = `«${cleanTrackTitle(ctx.title)}» — ${detail} (исполнитель: ${artist}).`;
    if (fact.length >= 35) {
      facts.push({ fact, scope: 'track', source: 'secondhandsongs' });
    }
  }

  if (facts.length === 0) {
    const meta = stripHtml(
      page.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1] ?? '',
    );
    if (meta.length >= 35) {
      facts.push({ fact: meta, scope: 'track', source: 'secondhandsongs' });
    }
  }
  return facts.slice(0, 4);
}
