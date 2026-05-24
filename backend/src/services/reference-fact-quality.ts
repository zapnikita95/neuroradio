import { highImpactBonus } from './story-fact-hunt.js';

/** Filters dry encyclopedia lines; ranks human drama, breakthroughs, meaning — not working titles. */

const BORING_FACT_PATTERNS: RegExp[] = [
  /\bconsists?\s+of\b/i,
  /\bcomposed\s+of\b/i,
  /\bline[- ]?up\b/i,
  /\bmembers?\s+(?:are|include|were)\b/i,
  /\b(?:duo|trio|quartet)\s+(?:of|comprising|consisting)\b/i,
  /\b(?:musical\s+)?(?:duo|band|group)\s+from\b/i,
  /\bis\s+an?\s+(?:American|British|Canadian|Russian|Ukrainian|Swedish|German|French|Japanese|Korean|Australian)\s+(?:musical\s+)?(?:duo|band|group|artist|rock\s+band)\b/i,
  /\bis\s+a\s+song\s+by\b/i,
  /\b(?:was|were)\s+formed\s+in\b/i,
  /\boriginally\s+formed\b/i,
  /\boriginally\s+(?:titled|called|named|released)\b/i,
  /\bworking\s+title\b/i,
  /\bunder\s+the\s+name\b/i,
  /\bpromo(?:tion(?:al)?)?\s+(?:track|single)\b/i,
  /\bfeatured\s+on\s+(?:their|the|its)\s+(?:\w+\s+){0,3}album\b/i,
  /\bfifth\s+album\b/i,
  /\bfirst\s+single\b/i,
  /\breleased\s+as\s+(?:the|a)\s+(?:album'?s\s+)?single\b/i,
  /\bwritten\s+and\s+produced\s+by\b/i,
  /\bwritten\s+by\s+band\s+members\b/i,
  /\b(?:has|have)\s+released\s+\d+\s+(?:studio\s+)?albums?\b/i,
  /\bdiscography\b/i,
  /\bthe\s+lyrics\s+(?:are|were|narrate)\b/i,
  /\b(?:appeared|featured|used)\s+in\b/i,
  /\b(?:advert|commercial|ad\s+campaign)\b/i,
  /\bRimmel\b/i,
  /\bDie\s+Hard\b/i,
  /\b(?:EA\s+Sports|FIFA|Rugby\s+06|video\s+game)\b/i,
  /\bsoundtracks?\s+(?:of|for)\b/i,
  /\bgoing\s+gold\b/i,
  /\bselling\s+(?:nearly\s+)?(?:a\s+)?million\b/i,
  /\bset\s+the\s+group\s+off\s+to\s+a\s+good\s+start\b/i,
  /\bappears?\s+on\s+the\s+soundtracks?\s+of\s+EA\b/i,
  /\bappears?\s+on\s+the\s+albums?\b/i,
  /\bcertified\s+gold\b/i,
  /\bselling\s+over\s+a\s+million\b/i,
  /\bcharting\s+high\s+on\s+music\b/i,
  /\baccessible\s+to\s+a\s+mainstream\b/i,
  /\bbest-selling\s+songs?\s+of\s+all\s+time\b/i,
  /\b(?:cover|кавер)[- ]?versions?\b/i,
  /\bwere\s+recorded\s+by\b/i,
  /\bкавер[- ]?верси/i,
  /музыкантами были записаны кавер/i,
  /\brecorded\s+cover\s+versions\b/i,
];

const STORY_FACT_PATTERNS: RegExp[] = [
  /\bfirst\s+(?:Native\s+American|Black|woman|integrated|time)\b/i,
  /\b(?:historic|historical|legendary|breakthrough|milestone|revival|resurg|comeback|forgotten|oblivion|rediscover)\b/i,
  /\b(?:Guardians\s+of\s+the\s+Galaxy|interest\s+increased|resurged|viral|phenomenon|Internet\s+phenomenon)\b/i,
  /\b(?:segregat|racial|illegal|defied|banned|forbidden|controvers|scandal|protest|censored|lawsuit|plagiar)\b/i,
  /\b(?:slavery|mining|union|strike|poverty|working\s+class|prison|deport|coal\s+miner|company\s+store|owe\s+my\s+soul)\b/i,
  /\b(?:Carnegie\s+Hall|Apollo\s+Theater|Woodstock|Grammy|Oscar|Eurovision|King\s+of\s+Swing|coming\s+out\s+party)\b/i,
  /\b(?:audience|crowd|fans|screamed|tears|cheered|went\s+wild|standing\s+ovation)\b/i,
  /\b(?:obsessed|wild|primitive|shaman|explosive|electric|voodoo|coffin|skull|outrageous|theatrical)\b/i,
  /\b(?:meaning|metaphor|written\s+(?:about|after|during|in\s+response)|inspired\s+by|based\s+on\s+(?:a|the|his|her|true))\b/i,
  /\b(?:took\s+issue|disagreed|argued|nearly\s+(?:didn't|dropped)|rejected\s+at\s+first|refused|described|attempt\s+to\s+write|bounced|overdubs|generations\s+of)\b/i,
  /\b(?:platinum|gold|number\s+one|topped|billboard\s+hot\s+100)\b/i,
  /\b(?:iron curtain|eastern bloc|ussr|soviet union|soviet)\b/i,
  /\b(?:mozambique|mozambican|african musician)\b/i,
  /\b(?:прорыв|скандал|запрет|возвращени|забвени|историческ|впервые|расизм|сегрегац|шахт|уголь|рабств|смысл|метафор|вдохновен|бутлег|подполь|крови|Цой|ссср|совет)\b/i,
];

export const MIN_PICK_INTEREST_SCORE = 6;

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function interestScore(fact: string): number {
  let score = 0;
  for (const pattern of STORY_FACT_PATTERNS) {
    if (pattern.test(fact)) score += 5;
  }
  if (/\b(first|only|never|breakthrough|surprise)\b/i.test(fact)) score += 3;
  if (/\b(million|billion|decade|generation)\b/i.test(fact)) score += 2;
  if (/\boriginally\s+(?:titled|called|named)\b/i.test(fact)) score -= 20;
  if (/\b(?:promo|album'?s first single|video game)\b/i.test(fact)) score -= 8;
  const mediaHits = fact.match(
    /\b(?:film|movie|advert|commercial|soundtrack|video game|FIFA|Rugby|Rimmel|Die Hard|EA Sports)\b/gi,
  );
  if (mediaHits && mediaHits.length >= 2) score -= 20;
  if (/\b(?:appeared|featured|used)\s+in\b/i.test(fact) && !/\b(?:scandal|controvers|banned|illegal|defied)\b/i.test(fact)) {
    score -= 12;
  }
  if (/\babout\s+(?:a|the|his|her)\s+\w+/i.test(fact) && /\b(?:miner|mine|coal|love|war|death|life|pain|protest)\b/i.test(fact)) {
    score += 5;
  }
  score += highImpactBonus(fact);
  return score;
}

export function isBoringFact(fact: string): boolean {
  const trimmed = fact.trim();
  if (trimmed.length < 30) return true;
  if (BORING_FACT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
  if (interestScore(trimmed) < 4) return true;
  return false;
}

export function filterAndRankFacts(facts: string[], max = 6): string[] {
  const seen = new Set<string>();
  return facts
    .map((fact) => fact.trim())
    .filter((fact) => fact.length >= 35)
    .filter((fact) => {
      const key = normalizeForMatch(fact);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => interestScore(b) - interestScore(a))
    .filter((fact) => !isBoringFact(fact))
    .slice(0, max);
}
