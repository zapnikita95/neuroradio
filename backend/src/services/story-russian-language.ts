const FORBIDDEN_PHRASES: RegExp[] = [
  /\bnative\s+american\b/i,
  /\bbillboard\b/i,
  /\btop[-\s]?5\b/i,
  /\btop[-\s]?ten\b/i,
  /#\s*\d/,
  /\bnumber\s+one\b/i,
  /\bshock\s+rock\b/i,
  /\boverdub/i,
  /\bmacabre\b/i,
  /\bviral\b/i,
  /\bperformance\b/i,
  /\bultimate\s+pop\b/i,
  /\bbootleg\b/i,
  /\bsingle\b/i,
  /\bband\b/i,
  /\bchart\b/i,
  /\blive\b/i,
  /\bstudio\b/i,
  /\btrack\b/i,
  /\bsong\b/i,
  /\bhit\b/i,
  /\bmainstream\b/i,
  /\bunderground\b/i,
];

const LATIN_WORD = /\b[a-z]{3,}\b/i;

function latinTokens(value: string): string[] {
  return value
    .split(/[^\p{L}\p{N}]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && /[a-z]/i.test(part));
}

function stripAllowedNameTokens(text: string, artist: string, title: string): string {
  let result = text;
  for (const source of [artist, title]) {
    for (const token of latinTokens(source)) {
      result = result.replace(new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
    }
  }
  return result;
}

export function hasEnglishLeak(script: string, artist = '', title = ''): boolean {
  const text = script.trim();
  if (!text) return false;
  if (FORBIDDEN_PHRASES.some((pattern) => pattern.test(text))) return true;
  const withoutQuotes = text.replace(/«[^»]*»/g, ' ');
  const stripped = stripAllowedNameTokens(withoutQuotes, artist, title);
  // pop-музыка, hip-hop — лatin-префикс перед русским, не английская вставка
  const noHybrids = stripped.replace(/\b[a-z]{2,}(?=-[\u0400-\u04FF])/gi, '');
  return LATIN_WORD.test(noHybrids);
}

export const RUSSIAN_LANGUAGE_PROMPT_BLOCK = `ЯЗЫК — ТОЛЬКО РУССКИЙ, ДЛЯ ОЗВУЧКИ:
- Весь текст по-русски. Лatinицу — только внутри «имя артиста» или «название трека»; дальше «он», «артист», «песня».
- Факты с Wikipedia на английском переводи мыслью, не копируй английские термины.
- ПЛОХО: «Native American на Billboard top-5», «#1 ABBA», «shock rock», «viral на Reddit», «overdub на tape».
- ХОРОШО: «индейская группа в пятёрке американского хит-парада», «единственное первое место ABBA в США», «шок-шоу на сцене», «вирусный ажиотаж на Reddit», «сотни дублей на плёнке».
- Запрещены английские слова вне кавычек с именем/названием: chart, band, single, live, performance, mainstream, underground и т.п.`;
