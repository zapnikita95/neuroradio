import { highImpactBonus } from './story-fact-hunt.js';
import type { StoryNarratorId } from './story-narrator.js';
import { isTruncatedMarketingSnippet, isUnspeakableWebSeed, isLyricsPageSeed, isArtistIdentityBioSnippet } from './web-snippet-accept.js';

/** Filters dry encyclopedia lines; ranks human drama, breakthroughs, meaning — not working titles. */

/** Wikipedia lead paragraph — birthplace, label deal, EP listing; not a story hook. */
export const WIKI_BIOGRAPHY_PATTERNS: RegExp[] = [
  /\b(?:is|was)\s+an?\s+(?:English|American|British|Canadian|Australian|Irish|Scottish|Welsh)\s+singer[- ]songwriter\b/i,
  /\bBorn in\b.*\b(?:raised in|grew up in)\b/i,
  /\bbegan writing songs around the age of\b/i,
  /\bindependently released the extended play\b/i,
  /\bsigned with\b.*\bRecords\b/i,
  /\bconsisting of\b.*\bon vocals\b/i,
  /\bродился в\b.*\b(?:вырос|воспитан)\b/i,
  /\bанглийский певец,\s*автор песен\b/i,
  /\bначал писать (?:музыку|песни) (?:ещё )?в (?:детстве|(?:раннем )?возрасте)\b/i,
  /\bподписал контракт с\b/i,
];

export function isWikiBiographyLead(fact: string): boolean {
  const trimmed = fact.trim();
  if (trimmed.length < 80) return false;
  const bioHits = WIKI_BIOGRAPHY_PATTERNS.filter((p) => p.test(trimmed)).length;
  return bioHits >= 2 || (bioHits >= 1 && trimmed.length >= 220);
}

/** Discogs/Setlist catalog seeds — допустимы для indie, когда других фактов нет. */
const DEDICATED_CATALOG_SEED_PATTERNS: RegExp[] = [
  /Discogs датирован \d{4}/i,
  /выходил на лейбле/i,
  /трек «[^»]+» идёт \d+:\d+/i,
  /впервые прозвучала на живом выступлении/i,
  /(?:electronicore|deathtronica|metalcore|post-punk|shoegaze)\s+band\s+from/i,
  /(?:piece|member)\s+.*\s+band\s+from/i,
];

/** «Указан в альбоме X» — метаданные, не семя для истории (LLM выдумает звук). */
export function isAlbumListingSeed(fact: string): boolean {
  return /на Last\.fm указан в альбоме|указан в альбоме «/i.test(fact.trim());
}

/** Last.fm playcount/listeners — сохраняем в банк, но не считаем успешным фактом. */
export function isListeningStatsFact(fact: string): boolean {
  return /\b(?:last\.?fm|слушател|прослушиван|scrobbles?|playcount)\b/i.test(fact.trim());
}

/** Метаданные harvest — в банк можно, в прогресс/pick/hot не идут. */
export function isMetadataHarvestFact(fact: string): boolean {
  const t = fact.trim();
  return isListeningStatsFact(t) || isAlbumListingSeed(t);
}

/** Год/лейбл/сборник на Discogs — факт, но не ядро истории (LLM дорисует «синтезаторы»). */
export function isCatalogMetadataSeed(fact: string): boolean {
  const t = fact.trim();
  if (isAlbumListingSeed(t)) return true;
  if (isTrackDurationCatalogSeed(t)) return true;
  if (/Discogs датирован \d{4}/i.test(t)) return true;
  if (/выходил на лейбле/i.test(t)) return true;
  if (/Релиз «[^»]+».*(?:выходил на лейбле|\([^)]+\)\s*выходил)/i.test(t)) return true;
  if (/на Last\.fm указан в альбоме «[^»]+»/i.test(t)) return true;
  if (/исполнителя .+ на Last\.fm указан в альбоме/i.test(t)) return true;
  return false;
}

/** «Трек идёт 3:33» — метаданные, не история про релиз. */
export function isTrackDurationCatalogSeed(fact: string): boolean {
  return /трек «[^»]+» идёт \d+:\d+/i.test(fact.trim());
}

/** «Band formed in CITY in YEAR» — слабое семя для истории конкретного трека. */
export function isArtistFormationBioSeed(fact: string): boolean {
  const t = fact.trim();
  return (
    /\b(?:is|was)\s+(?:an?\s+)?(?:\w+\s+){0,4}(?:band|group|artist|duo|trio)\s+formed\s+in\b/i.test(t) ||
    /\b(?:band|group)\s+formed\s+in\s+[A-Z][\w-]+(?:\s+in\s+\d{4})?\b/i.test(t) ||
    /\b(?:originally )?started as a (?:duo|duet|band|group)\b/i.test(t) ||
    /\bbefore transitioning to a solo\b/i.test(t)
  );
}

export function isDedicatedCatalogSeed(fact: string): boolean {
  if (isAlbumListingSeed(fact)) return false;
  return DEDICATED_CATALOG_SEED_PATTERNS.some((p) => p.test(fact.trim()));
}

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
  /\b(?:name|назван\w*)\b.*\b(?:refers to|term for|means|происходит|отсылает|обозначает|термин)\b/i,
  /\boriginally\s+formed\b/i,
  /\bworking\s+title\b/i,
  /\bfifth\s+album\b/i,
  /\bfirst\s+single\b/i,
  /\breleased\s+as\s+(?:the|a)\s+(?:album'?s\s+)?single\b/i,
  /\bwritten\s+and\s+produced\s+by\b/i,
  /\bwritten\s+by\s+band\s+members\b/i,
  /\b(?:has|have)\s+released\s+\d+\s+(?:studio\s+)?albums?\b/i,
  /\bdiscography\b/i,
  /\bthe\s+lyrics\s+(?:are|were|narrate)\b/i,
  /\b(?:appeared|featured|used)\s+in\b/i,
  /(?:премьер\w*\s+фильм|фильм\s*«|военной\s+драм|картин\w*\s+рассказывает|в\s+кинотеатр)/i,
  /\b(?:Netflix|F is for Family)\b/i,
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

/** Цифры релиза, платформы, редкость — семя для «Фанат-коллекционер». */
export const COLLECTOR_FACT_PATTERNS: RegExp[] = [
  /\b(?:tiktok|spotify|youtube|apple\s+music|streaming)\b/i,
  /\b(?:billion|million)\b.*\b(?:streams?|plays|views?)\b/i,
  /\b(?:streams?|plays)\b.*\b(?:billion|million|spotify)\b/i,
  /\bco[- ]?writ(?:ten|er)\b/i,
  /\b(?:bush\s+doof|music\s+video|official\s+video)\b/i,
  /\b(?:limited\s+edition|vinyl|pressing|bootleg|b[- ]?side|cassette|7[- ]?inch)\b/i,
  /\b(?:debut\s+single|lead\s+single)\b.*\b(?:since|first|only)\b/i,
  /\b(?:did\s+not\s+chart|charted)\b.*\b(?:until|following|after)\b/i,
  /\b(?:прорыв|тикток|стрим\w*|миллиард|миллион|хит\s+100|соавтор|бутлег|винил|лимитк)\b/i,
];

export function isCollectorFact(fact: string): boolean {
  return COLLECTOR_FACT_PATTERNS.some((pattern) => pattern.test(fact));
}

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
  /\b(?:withheld from release|banned by|lyrical controversy|Jimi Hendrix inspired)\b/i,
  /\b(?:iron curtain|eastern bloc|ussr|soviet union|soviet)\b/i,
  /\b(?:mozambique|mozambican|african musician)\b/i,
  /(?:прорыв|скандал|запрет|возвращени|забвени|историческ|впервые|расизм|расист|дискриминац|сегрегац|шахт|уголь|рабств|смысл|метафор|вдохновен|бутлег|подполь|крови|Цой|ссср|совет)/i,
  /(?:арми\w*|тюрьм\w*|бедност\w*|безуми\w*|одержим|предатель|измен\w*|изгнан|уволен|запретил|цензур|суд|плагиат|украл\w*|воровал)/i,
  /\b(?:не\s+умел|не\s+знал|не\s+читал).*(?:нот|музык)/i,
  /\b(?:написал\w*|сочинил\w*|записал\w*).*(?:арми|тюрьм|больниц|церкв)/i,
];

/** Human backstory > metrics-only trivia. */
const BACKSTORY_FACT_PATTERNS: RegExp[] = [
  /\b(?:daughter|son|family|parents|mother|father|wife|divorce|custody|adopt(?:ed|ion)?|child(?:ren)?)\b/i,
  /\b(?:apology|letter|explained|explain|emotional|heartfelt|most emotional|dedicated to)\b/i,
  /\b(?:interview|said|he called|she said|told)\b/i,
  /\b(?:personal|real[- ]life|autobiograph|memoir)\b/i,
  /(?:дочер|сын|семь|мать|отец|жена|развод|опек|усынов|извини|объясн|личн|эмоцион)/i,
];

export const MIN_PICK_INTEREST_SCORE = 6;

/** «Directed by X» / «music video» без драмы — не топ семя; сильные клипы (бюджет, скандал) не штрафуем. */
const GENERIC_MUSIC_VIDEO_SEED =
  /\b(?:music video|official video|video was directed|directed by|promotional video|accompanying music video|клип(?:а|ом|е|у)?|режисс(?:ё|е)р(?:ом|а|у)?|filmed by|video for|premiered on mtv)\b/i;

const STRONG_MUSIC_VIDEO_STORY =
  /\b(?:controversial|scandal|banned|million|invested|sevenfold|optical illusion|vfx|cgi|first (?:ever )?(?:music )?video|national film registry|fourteen.minute|полмиллион|собственн\w+\s+денег|record registry|переснимал|бюджет)\b/i;

export function isGenericMusicVideoSeed(fact: string): boolean {
  const trimmed = fact.trim();
  if (!GENERIC_MUSIC_VIDEO_SEED.test(trimmed)) return false;
  if (STRONG_MUSIC_VIDEO_STORY.test(trimmed)) return false;
  if (BACKSTORY_FACT_PATTERNS.some((p) => p.test(trimmed))) return false;
  if (STORY_FACT_PATTERNS.some((p) => p.test(trimmed))) return false;
  return true;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BACKSTAGE_DRAMA_PATTERNS: RegExp[] = [
  /\b(?:conflict|scandal|controvers|banned|refused|lawsuit|argued|ultimatum|nearly|disagreed|reject(?:ed|ion)?)\b/i,
  /(?:скандал|конфликт|запрет|отказ|суд|плагиат|ссор|ультиматум|почти не|отверг)/i,
];

const EXPERT_MECHANISM_PATTERNS: RegExp[] = [
  /\b(?:genre|subgenre|produc|arrang|synthes|sample|tempo|harmon|chord|instrument|structure|suite|operatic)\b/i,
  /(?:жанр|аранж|продакш|синтез|семпл|ритм|гармон|структур|без припева)/i,
];

const CONTEMPORARY_ERA_PATTERNS: RegExp[] = [
  /\b(?:iron curtain|eastern bloc|ussr|soviet union|soviet|cold war|mozambique|african musician)\b/i,
  /(?:ссср|совет|железн|эпох|поколен|прорыв)/i,
];

/** Score delta when picking seed fact for a fixed narrator (not for `auto`). */
export function narratorFactBoost(fact: string, narrator: StoryNarratorId = 'auto'): number {
  if (narrator === 'auto' || narrator === 'radio_host' || narrator === 'night_dj') return 0;

  const trimmed = fact.trim();
  if (narrator === 'fan') {
    if (isCollectorFact(trimmed)) return 14;
    if (/\b(?:chart|streams?|billboard|tiktok|vinyl|edition|co[- ]?writ)\b/i.test(trimmed)) return 8;
    if (isWeakChartSeed(trimmed)) return 6;
    return 0;
  }

  if (narrator === 'expert') {
    if (EXPERT_MECHANISM_PATTERNS.some((p) => p.test(trimmed))) return 12;
    if (/\b(?:blues|jazz|hip hop|techno|metal|punk|funk|disco|synth|grunge|drill)\b/i.test(trimmed)) return 8;
    return 0;
  }

  if (narrator === 'backstage') {
    if (BACKSTAGE_DRAMA_PATTERNS.some((p) => p.test(trimmed))) return 16;
    if (BACKSTORY_FACT_PATTERNS.some((p) => p.test(trimmed)) && BACKSTAGE_DRAMA_PATTERNS.some((p) => p.test(trimmed))) {
      return 10;
    }
    if (isBoringFact(trimmed)) return -18;
    return -6;
  }

  if (narrator === 'contemporary') {
    if (CONTEMPORARY_ERA_PATTERNS.some((p) => p.test(trimmed))) return 10;
    if (STORY_FACT_PATTERNS.some((p) => p.test(trimmed))) return 5;
    return 0;
  }

  return 0;
}

export function adjustedInterestScore(fact: string, narrator: StoryNarratorId = 'auto'): number {
  return interestScore(fact) + narratorFactBoost(fact, narrator);
}

export function interestScore(fact: string): number {
  let score = 0;
  const trimmed = fact.trim();
  if (isLyricsPageSeed(trimmed)) score -= 50;
  if (isArtistIdentityBioSnippet(trimmed)) score += 16;
  if (isTruncatedMarketingSnippet(trimmed)) score -= 40;
  if (isUnspeakableWebSeed(trimmed)) score -= 50;
  if (isCollectorFact(fact)) score += 8;
  if (isDedicatedCatalogSeed(trimmed)) score += 12;
  if (isTrackDurationCatalogSeed(trimmed)) score -= 10;
  if (/^[«"']/.test(trimmed) && /\b(?:first|new|debut|lead)\b/i.test(trimmed)) score += 18;
  if (/\b(?:first new (?:song|music|single)|announced (?:a )?new ep|new lead singer)\b/i.test(trimmed)) {
    score += 14;
  }
  if (/\b(?:deathtronica|electronicore|metalcore|hardcore|scream\s+vocals?)\b/i.test(trimmed)) score += 20;
  if (isArtistFormationBioSeed(trimmed)) score -= 12;
  if (BACKSTORY_FACT_PATTERNS.some((pattern) => pattern.test(fact))) score += 12;
  for (const pattern of STORY_FACT_PATTERNS) {
    if (pattern.test(fact)) score += 5;
  }
  if (/\b(first|only|never|breakthrough|surprise)\b/i.test(fact)) score += 3;
  if (/\b(million|billion|decade|generation)\b/i.test(fact)) score += 2;
  const isPromoRename = /\b(?:promo track under the name|originally released as a promo)\b/i.test(fact);
  const isRadioEdit = /\b(?:single cut is significantly shorter|album version featuring an introductory)\b/i.test(fact);
  if (/\b(?:controversial nature|five different versions|banned by|refused to)\b/i.test(fact)) {
    score += 10;
  }
  if (isGenericMusicVideoSeed(fact)) score -= 14;
  if (isPromoRename || isRadioEdit) score += 10;
  if (/\b(?:avoid discrimination|appeal to (?:a )?white|change their name|stage name|heritage)\b/i.test(fact)) {
    score += 12;
  }
  if (/(?:Виктор\s+Цой|Цой).*(?:198[0-9]|арми|запис|альбом|композици)/i.test(fact)) score += 14;
  if (/(?:композици\w*|песн\w*).*?(?:цой|198[0-9])/i.test(fact)) score += 14;
  if (/(?:откос\w*|притвор\w*\s+сумасшедш|двойственн\w*\s+отношени\w*\s+к\s+арми)/i.test(fact)) score += 12;
  else if (/\boriginally\s+(?:titled|called|named)\b/i.test(fact)) score -= 20;
  else if (/\b(?:promo|album'?s first single|video game)\b/i.test(fact)) score -= 8;
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
  if (/\b(?:billboard|hot 100|charted|peaked at number|top five on the)\b/i.test(fact)) score -= 15;
  if (/\b(?:topped the|weeks on the|singles chart|number one in|popularise.{0,30}music video)\b/i.test(fact)) {
    score -= 22;
  }
  if (/\b(?:operatic|no chorus|three weeks to record|skeptical|didn't believe|thought it (?:was|would)|recorded in six|distinct sections|without chorus|lack of a refr|six-minute suite)\b/i.test(fact)) {
    score += 14;
  }
  if (/^(?:This image would later be used|Filmed at the New London Theatre)\b/i.test(fact.trim())) score -= 18;
  if (/(?:предложил\w*|borrowed|suggested|названи\w*).{0,80}(?:«|")/i.test(fact)) score += 12;
  if (/(?:origin|originally|meaning|metaphor|hidden|disguised|ironic|paradox|заклинан|смысл|метафор|ирони|парадокс)/i.test(fact)) score += 6;
  // Genius / narrative parser facts (не chart-trivia).
  if (/\b(?:widely considered|grunge anthem|ultimate grunge|song'?s success|omnipresence|grew tired of it|removed it from their live)\b/i.test(fact)) {
    score += 14;
  }
  if (
    /\b(?:opening track|lead single)\b/i.test(fact) &&
    /\b(?:album|released|debut|second|third|nevermind)\b/i.test(fact)
  ) {
    score += 14;
  }
  if (/\b(?:deodorant|Hanna was referring|inspired the title|wrote the song in)\b/i.test(fact)) score += 10;
  if (/(?:написал\w*|сочинил\w*|автором текста).*(?:Цой|цой|«Кино»|Кино)/i.test(fact)) score += 10;
  if (/\b(?:intended to|repudiat\w*|members? of the (?:band|group|four)|their past|dark past)\b/i.test(fact)) score += 8;
  score += highImpactBonus(fact);
  return score;
}

/** Chart/metrics-only — не семя для истории. */
export function isWeakChartSeed(fact: string): boolean {
  if (/\bmost[- ]streamed (?:track|song)|most streamed (?:track|song)\b/i.test(fact)) return false;
  if (/\bbillion streams?\b/i.test(fact) && /\b(?:song|track|single|this|was|is)\b/i.test(fact)) {
    return false;
  }
  return (
    /\b(?:topped the|weeks on the (?:UK )?singles|popularise.{0,25}music video format|peaked at number|reached number (?:one|\d+) on|billboard hot|charted for \d+ weeks)\b/i.test(fact) ||
    /\b(?:billion views|most-streamed|certified diamond|downloads across)\b/i.test(fact)
  );
}

export function isBoringFact(fact: string): boolean {
  const trimmed = fact.trim();
  if (trimmed.length < 30) return true;
  if (isDedicatedCatalogSeed(trimmed)) return false;
  if (isWikiBiographyLead(trimmed)) return true;
  if (isCollectorFact(trimmed)) return false;
  // Promo rename, radio ban, Jimi Hendrix origin — keep even if sentence also mentions album/single.
  if (highImpactBonus(trimmed) >= 6) return false;
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
    .filter((fact) => !isTruncatedMarketingSnippet(fact))
    .filter((fact) => !isUnspeakableWebSeed(fact))
    .sort((a, b) => interestScore(b) - interestScore(a))
    .filter((fact) => !isBoringFact(fact))
    .slice(0, max);
}

/** Fact reads like a soulful human story anchor. */
export function isBackstoryFact(fact: string): boolean {
  return BACKSTORY_FACT_PATTERNS.some((pattern) => pattern.test(fact));
}
