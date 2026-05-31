import fetch from 'node-fetch';

const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';

function toWikiTitle(raw: string): string {
  return encodeURIComponent(raw.trim().replace(/\s+/g, '_'));
}

/** Media tags often use ALL CAPS tokens — Wikipedia titles are usually title case (Lit Killah). */
function wikiTitleVariants(artist: string): string[] {
  const variants = new Set<string>([artist.trim()]);
  const acronymsToTitle = artist.replace(/\b[A-Z]{2,}\b/g, (word) => word.charAt(0) + word.slice(1).toLowerCase());
  variants.add(acronymsToTitle);
  const titleCase = artist.replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  variants.add(titleCase);
  return [...variants].filter((v) => v.length > 1);
}

function buildArtistTitleCandidates(artist: string): string[] {
  const base = wikiTitleVariants(artist);
  const withRoles: string[] = [];
  for (const name of base) {
    withRoles.push(
      name,
      `${name} (musician)`,
      `${name} (singer)`,
      `${name} (rapper)`,
      `${name} (band)`,
      `${name} (musical group)`,
    );
  }
  return [...new Set(withRoles)];
}

async function searchWikiTitle(lang: 'en' | 'ru', query: string): Promise<string | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*` +
    `&srlimit=3&srsearch=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    return data.query?.search?.[0]?.title?.trim() ?? null;
  } catch {
    return null;
  }
}

async function fetchSummaryExtract(lang: 'en' | 'ru', title: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${toWikiTitle(title)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { extract?: string; type?: string };
    if (data.type === 'disambiguation') return null;
    const extract = data.extract?.trim();
    return extract && extract.length >= 40 ? extract : null;
  } catch {
    return null;
  }
}

function isDisambiguation(text: string): boolean {
  return /\b(may refer to|disambiguation)\b/i.test(text);
}

/** First paragraph from artist Wikipedia — prefers English for indie bios. */
export async function fetchArtistWikiLead(
  artist: string,
): Promise<{ text: string; lang: 'en' | 'ru' } | null> {
  const titlesToTry = new Set<string>();
  for (const candidate of buildArtistTitleCandidates(artist)) {
    titlesToTry.add(candidate);
  }
  for (const query of [`${artist} musician`, `${artist} singer`, `${artist} rapper`, artist]) {
    for (const q of wikiTitleVariants(query)) {
      const found = await searchWikiTitle('en', q);
      if (found) titlesToTry.add(found);
    }
  }

  for (const wikiTitle of titlesToTry) {
    const en = await fetchSummaryExtract('en', wikiTitle);
    if (en && !isDisambiguation(en)) {
      return { text: en, lang: 'en' };
    }
  }

  for (const wikiTitle of titlesToTry) {
    const ru = await fetchSummaryExtract('ru', wikiTitle);
    if (ru && !isDisambiguation(ru)) {
      return { text: ru, lang: 'ru' };
    }
  }

  return null;
}
