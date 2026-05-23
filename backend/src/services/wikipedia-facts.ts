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

function extractFactBullets(text: string, max = 4): string[] {
  const sentences = text
    .replace(/\([^)]*\)/g, ' ')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35 && s.length <= 220);

  const scored = sentences
    .map((sentence) => {
      let score = 0;
      if (/\b(sample|cover|remix|record|recorded|studio|producer|billboard|chart|grammy|eurovision|sampled|plagiar|ban|scandal|originally|written|composed|released|debut|soundtrack|film|movie|tv|radio|label|vinyl|cassette|cd|youtube|spotify|million|platinum|gold|hit|single|album|tour|concert|festival|orchestra|guitar|piano|drum|bass|vocal|lyric|translate|adapt|based on|prado|pérez|hawkins|spell|mambo|bega)\b/i.test(sentence)) {
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

function buildTitleCandidates(artist: string, title: string): string[] {
  const cleanTitle = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  return [
    `${cleanTitle} (${artist} song)`,
    `${cleanTitle} (song)`,
    cleanTitle,
    artist,
  ].filter((value, index, arr) => value.length > 1 && arr.indexOf(value) === index);
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
    const summary = await fetchSummary(lang, candidate);
    if (!summary) continue;
    const bullets = extractFactBullets(summary);
    if (bullets.length > 0) return bullets;
  }

  if (lang === 'en') {
    for (const candidate of candidates) {
      const summary = await fetchSummary('ru', candidate);
      if (!summary) continue;
      const bullets = extractFactBullets(summary);
      if (bullets.length > 0) return bullets;
    }
  }

  return [];
}
