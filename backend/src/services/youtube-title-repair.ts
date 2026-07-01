/** Fix mojibake / missing titles for YouTube harvest dashboard. */

export function looksBrokenTitle(title: string | undefined): boolean {
  if (!title?.trim()) return true;
  if (title.includes('\uFFFD')) return true;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(title)) return true;
  return false;
}

/** Latin-1 misread UTF-8 → restore Cyrillic when possible. */
export function repairMojibakeTitle(title: string): string {
  if (!title || !looksBrokenTitle(title)) return title;
  try {
    const fixed = Buffer.from(title, 'latin1').toString('utf8');
    if (!looksBrokenTitle(fixed) && /[\u0400-\u04FF]/.test(fixed)) return fixed;
  } catch {
    /* ignore */
  }
  return title;
}

export function resolveDisplayTitle(raw: string | undefined, videoId: string): string {
  const base = raw?.trim() || videoId;
  const repaired = repairMojibakeTitle(base);
  if (!looksBrokenTitle(repaired)) return repaired;
  return repaired;
}

export async function fetchYoutubeOembedTitle(videoId: string): Promise<string | null> {
  try {
    const watch = `https://www.youtube.com/watch?v=${videoId}`;
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    const title = data.title?.trim();
    return title && !looksBrokenTitle(title) ? title : null;
  } catch {
    return null;
  }
}

export async function repairVideoTitles(
  entries: Array<{ id: string; title?: string }>,
  opts: { concurrency?: number; onFixed?: (id: string, title: string) => void } = {},
): Promise<Map<string, string>> {
  const fixed = new Map<string, string>();
  const need = entries.filter((e) => looksBrokenTitle(repairMojibakeTitle(e.title ?? '')));
  const conc = opts.concurrency ?? 4;
  for (let i = 0; i < need.length; i += conc) {
    const chunk = need.slice(i, i + conc);
    await Promise.all(
      chunk.map(async (e) => {
        const mojibake = repairMojibakeTitle(e.title ?? '');
        if (!looksBrokenTitle(mojibake)) {
          fixed.set(e.id, mojibake);
          opts.onFixed?.(e.id, mojibake);
          return;
        }
        const fetched = await fetchYoutubeOembedTitle(e.id);
        if (fetched) {
          fixed.set(e.id, fetched);
          opts.onFixed?.(e.id, fetched);
        }
      }),
    );
  }
  return fixed;
}
