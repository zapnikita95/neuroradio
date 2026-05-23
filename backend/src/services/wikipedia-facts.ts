import fetch from 'node-fetch';

const USER_AGENT = 'MusicStoryBFF/1.0 (contact@example.com)';

function wikiLang(countryCode?: string): 'ru' | 'en' {
  return countryCode === 'RU' ? 'ru' : 'en';
}

function toWikiTitle(raw: string): string {
  return encodeURIComponent(raw.trim().replace(/\s+/g, '_'));
}

async function fetchSummary(lang: 'ru' | 'en', title: string): Promise<string | null> {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${toWikiTitle(title)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { extract?: string };
    const extract = data.extract?.trim();
    return extract && extract.length > 40 ? extract : null;
  } catch {
    return null;
  }
}

async function searchWikiTitle(lang: 'ru' | 'en', query: string): Promise<string | null> {
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*` +
    `&srlimit=5&srsearch=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      query?: { search?: Array<{ title?: string }> };
    };
    return data.query?.search?.[0]?.title ?? null;
  } catch {
    return null;
  }
}

function extractFactBullets(text: string, max = 4): string[] {
  const sentences = text
    .replace(/\([^)]*\)/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35 && s.length <= 220);

  const scored = sentences
    .map((sentence) => {
      let score = 0;
      if (
        /\b(sample|cover|remix|record|recorded|studio|producer|billboard|chart|grammy|originally|written|composed|released|debut|soundtrack|film|movie|tv|radio|label|vinyl|cassette|single|album|tour|concert|festival|orchestra|guitar|piano|drum|bass|vocal|lyric|translate|adapt|based on|plagiar|ban|scandal|hit|million|platinum|gold|mambo|hawkins|bega|prado|day|donovan)\b/i.test(
          sentence,
        )
      ) {
        score += 3;
      }
      if (/\b(запис|продюс|релиз|сингл|альбом|клип|радио|лейбл|кавер|сэмпл|оркестр|гитар|композ|напис|выпуст|эфир|чарт|скандал|плагиат)\b/i.test(sentence)) {
        score += 3;
      }
      if (/\b(влия|легендар|уникальн|магия музыки|соединяет людей)\b/i.test(sentence)) {
        score -= 5;
      }
      return { sentence, score };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map((item) => item.sentence);
}

function extractSentencesMentioning(text: string, needle: string, max = 3): string[] {
  const tokens = needle
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((part) => part.length >= 4);
  if (tokens.length === 0) return [];

  return text
    .replace(/\([^)]*\)/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35 && s.length <= 220)
    .filter((sentence) => {
      const lower = sentence.toLowerCase();
      const hits = tokens.filter((token) => lower.includes(token)).length;
      return hits >= Math.min(2, tokens.length);
    })
    .slice(0, max);
}

function buildTitleCandidates(artist: string, title: string): string[] {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [
    `${cleanTitle} (${artist} song)`,
    `${cleanTitle} (song)`,
    `${cleanTitle} by ${artist}`,
    cleanTitle,
    `${artist} ${cleanTitle}`,
    artist,
  ].filter((value, index, arr) => value.length > 1 && arr.indexOf(value) === index);
}

function buildSearchQueries(artist: string, title: string): string[] {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [
    `${cleanTitle} ${artist} song`,
    `${cleanTitle} song ${artist}`,
    `${artist} ${cleanTitle}`,
    `${artist} musician`,
  ];
}

async function fetchFactsForTitle(lang: 'ru' | 'en', title: string, songTitle: string): Promise<string[]> {
  const summary = await fetchSummary(lang, title);
  if (!summary) return [];
  const bullets = extractFactBullets(summary);
  if (bullets.length > 0) return bullets;
  return extractSentencesMentioning(summary, songTitle);
}

/**
 * Pull short factual bullets from Wikipedia (EN/RU) to anchor Groq stories.
 */
export async function fetchReferenceFacts(
  artist: string,
  title: string,
  countryCode?: string,
): Promise<string[]> {
  const lang = wikiLang(countryCode);
  const candidates = buildTitleCandidates(artist, title);

  for (const candidate of candidates) {
    const facts = await fetchFactsForTitle(lang, candidate, title);
    if (facts.length > 0) return facts;
  }

  for (const query of buildSearchQueries(artist, title)) {
    const foundTitle = await searchWikiTitle(lang, query);
    if (!foundTitle) continue;
    const facts = await fetchFactsForTitle(lang, foundTitle, title);
    if (facts.length > 0) return facts;
  }

  if (lang === 'en') {
    for (const candidate of candidates) {
      const facts = await fetchFactsForTitle('ru', candidate, title);
      if (facts.length > 0) return facts;
    }
    for (const query of buildSearchQueries(artist, title)) {
      const foundTitle = await searchWikiTitle('ru', query);
      if (!foundTitle) continue;
      const facts = await fetchFactsForTitle('ru', foundTitle, title);
      if (facts.length > 0) return facts;
    }
  }

  return [];
}
