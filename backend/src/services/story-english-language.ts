const CYRILLIC_WORD = /[\u0400-\u04FF]{3,}/;

const ALLOWED_CYRILLIC_IN_EN = new Set([
  'the',
]);

/** Detect unexpected Cyrillic in English narration (artist/title may stay Latin). */
export function hasRussianLeak(
  script: string,
  artist = '',
  title = '',
): boolean {
  const allowedTokens = new Set<string>();
  for (const part of [artist, title]) {
    for (const word of part.split(/\s+/)) {
      const clean = word.replace(/[^a-zA-Z\u0400-\u04FF-]/g, '');
      if (clean.length >= 2) allowedTokens.add(clean.toLowerCase());
    }
  }

  const stripped = script
    .replace(/[«»"']/g, ' ')
    .replace(/\b[a-z]{2,}\b/gi, ' ');

  const matches = stripped.match(/[\u0400-\u04FF]{3,}/g) ?? [];
  for (const match of matches) {
    const lower = match.toLowerCase();
    if (allowedTokens.has(lower)) continue;
    if (ALLOWED_CYRILLIC_IN_EN.has(lower)) continue;
    return true;
  }
  return CYRILLIC_WORD.test(stripped);
}

export const ENGLISH_LANGUAGE_PROMPT_BLOCK = `LANGUAGE — ENGLISH ONLY, FOR VOICEOVER:
- Write the entire script in natural spoken English.
- Keep proper nouns in their original spelling: artist names, track titles, labels, Billboard, Rolling Stone.
- Do NOT translate artist names or song titles into Russian or other languages.
- Genre terms in prose: hip-hop, pop-rock, folk-rock — spell naturally for TTS.
- Numbers and years: avoid digits in script; use "back then", "in those years", "early two-thousands".
- Facts from the seed — state directly ("sales jumped sevenfold"), not "I heard that sales jumped".
- A hit is on the chart or on air; in memory the track stays — not "a hit in everyone's memory".`;
