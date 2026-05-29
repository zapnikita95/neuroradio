/**
 * Web search + Wikipedia for local story research agent.
 */

export async function fetchWikipediaSummary(artist: string, title: string): Promise<string | null> {
  const candidates = [
    `${title.replace(/\s+/g, '_')}`,
    `${title.replace(/\s+/g, '_')}_(${artist.replace(/\s+/g, '_')}_song)`,
  ];
  for (const page of candidates) {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MusicStory/1.0 (local research)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { extract?: string; title?: string };
      const extract = data.extract?.trim();
      if (extract && extract.length > 80) {
        console.log(`[local-search] wikipedia ok page=${page} len=${extract.length}`);
        return extract.slice(0, 1200);
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function webSearch(query: string, maxResults = 5): Promise<string> {
  const q = query.trim();
  if (!q) return 'Укажите поисковый запрос.';

  console.log(`[local-search] query="${q.slice(0, 80)}"`);

  try {
    const body = new URLSearchParams({ q });
    const response = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; MusicStory/1.0)',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return `Поиск недоступен (HTTP ${response.status}).`;
    }
    const html = await response.text();
    const links =
      html.match(/class="result__a"[^>]*href="(https?:\/\/[^"]+)"/g)?.map((m) => {
        const hit = m.match(/href="(https?:\/\/[^"]+)"/);
        return hit?.[1] ?? '';
      }).filter(Boolean) ?? [];
    const titles =
      html.match(/class="result__a"[^>]*>([^<]+)<\/a>/g)?.map((m) => {
        const hit = m.match(/>([^<]+)<\/a>/);
        return decodeHtml(stripTags(hit?.[1] ?? ''));
      }) ?? [];
    const snippets =
      html.match(/class="result__snippet"[^>]*>\s*([^<]+)/g)?.map((m) => {
        const hit = m.match(/>\s*([^<]+)/);
        return decodeHtml(stripTags(hit?.[1] ?? '')).slice(0, 400);
      }) ?? [];

    const count = Math.min(maxResults, Math.max(links.length, titles.length));
    if (count === 0) return 'Ничего не найдено.';

    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      lines.push(
        `${i + 1}. ${titles[i] ?? ''}\n   ${snippets[i] ?? ''}\n   ${links[i] ?? ''}`.trim(),
      );
    }
    return lines.join('\n\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[local-search] failed: ${msg}`);
    return `Поиск не удался: ${msg}`;
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
