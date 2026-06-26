import { highImpactBonus } from './story-fact-hunt.js';
import type { StoryNarratorId } from './story-narrator.js';
import { isTruncatedMarketingSnippet, isUnspeakableWebSeed, isLyricsPageSeed, isArtistIdentityBioSnippet, decodeHtmlEntities } from './web-snippet-accept.js';

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
  /(?:electronicore|deathtronica|metalcore|post-punk|shoegaze)\s+band\s+from/i,
  /(?:piece|member)\s+.*\s+band\s+from/i,
];

/** «Указан в альбоме X» — метаданные, не семя для истории (LLM выдумает звук). */
export function isAlbumListingSeed(fact: string): boolean {
  return /на Last\.fm указан в альбоме|указан в альбоме «/i.test(fact.trim());
}

/** Discogs packaging / liner notes — not a story seed. */
export function isDiscogsPackagingSeed(fact: string): boolean {
  const t = fact.trim();
  return (
    /\b(?:gatefold|hype sticker|download card|printed inner sleeve|shrink wrap|obi strip)\b/i.test(t) ||
    /includes digital download/i.test(t)
  );
}

/** Playcount / streams / listeners — never harvest, pick, bank, or story seed. */
const LISTENING_STATS_PATTERNS: RegExp[] = [
  /\b(?:last\.?fm|scrobbles?|playcount)\b/i,
  /на\s+Last\.fm\s+у\s*«/i,
  /\b(?:monthly\s+listeners?|unique\s+listeners?)\b/i,
  /\bstreams?\s+on\s+(?:spotify|apple\s*music|youtube\s*music|deezer|tidal|soundcloud)\b/i,
  /\b(?:spotify|apple\s*music|youtube\s*music|deezer|soundcloud)\b.{0,80}\b(?:streams?|plays?|listeners?)\b/i,
  /\b(?:million|billion)\s+streams?\b/i,
  /\bhas\s+about\s+[\d.,]+\s+million\s+streams?\b/i,
  /\bcurrently,?\s+.{0,60}\b(?:million|billion)\s+streams?\b/i,
  /\b\d[\d.,\s]{2,}\s*(?:слушател\w*|прослушиван\w*)/i,
  /(?:слушател\w*|прослушиван\w*).{0,40}\d[\d.,\s]{2,}/i,
  /\b(?:миллион\w*|миллиард\w*)\s+(?:стрим\w*|прослушиван\w*)\b/i,
  /\b(?:most[- ]streamed|total\s+streams?)\b/i,
];

export function isListeningStatsFact(fact: string): boolean {
  const t = fact.trim();
  return LISTENING_STATS_PATTERNS.some((pattern) => pattern.test(t));
}

/** Метаданные harvest — в банк можно, в прогресс/pick/hot не идут. */
export function isMetadataHarvestFact(fact: string): boolean {
  const t = fact.trim();
  return isListeningStatsFact(t) || isAlbumListingSeed(t);
}

/** Wikipedia/Genius citation debris — не семя для истории. */
export function isCitationBibliographySeed(fact: string): boolean {
  const t = decodeHtmlEntities(fact).trim();
  if (/\bRetrieved\b/i.test(t) && /\b(?:via YouTube|from Wikipedia|from the original)\b/i.test(t)) {
    return true;
  }
  if (/\^\s*[A-Za-z][\w\s]{0,40}\(/.test(t)) return true;
  if (/&#\s*;/.test(t)) return true;
  if (/;\s*\.\s*Retrieved/i.test(t)) return true;
  if (/\|\s*March\s*,\s*;\s*\./i.test(t)) return true;
  if (/\bLive at\b.{0,120}\bRetrieved\b/i.test(t)) return true;
  if (/\bvia YouTube\b/i.test(t) && /\bRetrieved\b/i.test(t)) return true;
  return false;
}

/** Setlist.fm «впервые на живом выступлении DD-MM-YYYY (Venue)» — каталог, не история. */
export function isSetlistLiveDebutSeed(fact: string): boolean {
  const t = decodeHtmlEntities(fact).trim();
  return (
    /впервые прозвучала на живом выступлении/i.test(t) ||
    /\b(?:live debut|first performed live)\b/i.test(t)
  );
}

/** «Выступили в зале X» без драмы — не история про трек. */
export function isGenericConcertVenueSeed(fact: string): boolean {
  const t = decodeHtmlEntities(fact).trim();
  if (isCitationBibliographySeed(t)) return true;
  if (isSetlistLiveDebutSeed(t)) return true;
  if (!/\b(?:live at|performed at|concert at|live in|concert in)\b/i.test(t)) return false;
  if (/\bhigh airplay\b/i.test(t)) return false;
  if (/\b(?:banned|protest|scandal|controvers|riot|arrest|police|historic|milestone|withheld|refused)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:inspired by|intended to|meaning|metaphor|written about|anti-war|protest song)\b/i.test(t)) {
    return false;
  }
  return true;
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

/** Discogs sleeve/runout filler — not a story seed. */
export function isDiscogsLinerNotesSeed(fact: string): boolean {
  const t = fact.trim();
  return (
    /\bthanks to friends and family\b/i.test(t) ||
    /\bunauthorised copying\b/i.test(t) ||
    /\ball rights of the owner of copyright\b/i.test(t) ||
    /\bal rights of the owner\b/i.test(t)
  );
}

/** Студия + мастеринг + список брендов / Discogs liner notes — не история, всем похуй. */
export function isStudioEquipmentCatalogSeed(fact: string): boolean {
  const t = fact.trim();
  if (/\bUses:\s/i.test(t)) return true;
  if (/\b(?:From the (?:back cover|inner sleeve)|inner sleeve:|back cover:)\b/i.test(t)) return true;
  if (/\b(?:Assistant at|Pressing plant|runout etch|licensed worldwide|play it a[gǵ]ain)\b/i.test(t)) return true;
  if (/[℗©]\s*&?\s*[©℗]/.test(t) || /\bExclusively licensed\b/i.test(t)) return true;
  const gearBrands =
    (t.match(
      /\b(?:Yamaha|Gibson|Mesa Boogie|Line 6|Sterling Sound|Groovemaster|Bogner|Sabian|Evans|Digitech|Sennheiser|Dean Markley|Pro Mark|Lakland|Taye|UDrum|RAK Studios|Psalm Studios)\b/gi,
    ) ?? []).length;
  if (gearBrands >= 2) return true;
  const studioMaster =
    /\b(?:Recorded and mixed at|Recorded at|recorded at|Mixed at|mixed at|Mastered at|mastered at)\b/i.test(t) &&
    /\b(?:Studios?|Sound)\b/i.test(t);
  if (
    studioMaster &&
    !/\b(?:said|explained|inspired|meaning|controvers|scandal|sampled|wrote|intended|apology|perspective)\b/i.test(t)
  ) {
    if (gearBrands >= 1) return true;
    if (/Трек «[^»]+» вошёл в альбом/i.test(t)) return true;
    if (t.split(/[,;]/).length >= 4) return true;
  }
  return false;
}

/** Смысл песни / извинение / интервью про трек — сильное семя, не «lyrics page». */
export function isTrackMeaningNarrativeSeed(fact: string): boolean {
  const t = fact.trim();
  if (/\bwritten from the perspective\b/i.test(t)) return true;
  if (/\bserving as an (?:apology|tribute|farewell|letter)\b/i.test(t)) return true;
  if (/\b(?:said of the song|has said of the song|about the song)\b/i.test(t)) return true;
  if (/\blyrics here lamenting\b/i.test(t)) return true;
  if (/\b(?:apology to|tribute to|letter to)\s+[A-Z]/i.test(t)) return true;
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
    /\bbefore transitioning to a solo\b/i.test(t) ||
    /\b(?:pop rock band|rock band|band|group)\b.*\boriginated in\b/i.test(t) ||
    (/\boriginated in\b/i.test(t) &&
      /\b(?:band|group|artist|pop rock band|rock band)\b/i.test(t)) ||
    /\bThe group was formed in\b/i.test(t)
  );
}

/** «Blue October is from Houston» — geography bio, not a track story. */
export function isArtistGeographyBioSeed(fact: string): boolean {
  const t = fact.trim();
  if (/\b(?:wrote|written|recorded|arrangement|studio|backing vocals|co[- ]?written|inspired by)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(?:is|are)\s+from\s+[A-Z][\w\s,.'-]+(?:Texas|Houston|California|London|Sweden|America|England)\b/i.test(t) ||
    /\b(?:American|British|Canadian|Swedish|German|Swedish-American)\s+(?:alternative\s+)?(?:rock|pop|metal)\s+band\s+(?:from|based in)\b/i.test(t) ||
    /\b(?:rock|pop)\s+band\s+from\s+[A-Z]/i.test(t) ||
    /\bheadquartered\s+in\b/i.test(t) ||
    /\bbased\s+in\s+[A-Z][\w\s,.'-]+(?:Texas|Houston|California)\b/i.test(t)
  );
}

/** YouTuber/TikTok bleed — «Dobrik started using X in vlogs», not a song backstory. */
export function isSocialMediaInfluencerBleed(fact: string): boolean {
  const t = fact.trim();
  return (
    /\b(?:dobrik|mr\.?\s*beast|logan\s+paul|jake\s+paul|tiktok(?:er|s)?|you(?:tu)?ber|vlog(?:ger|s)?)\b/i.test(t) ||
    /\b(?:during (?:his|her|their) vlogs?|in (?:his|her|their) videos?|went viral on (?:tiktok|youtube))\b/i.test(t) ||
    /\bstarted using\b.{0,60}\b(?:vlog|tiktok|youtube|reels?)\b/i.test(t)
  );
}

/** Wikipedia/Last.fm disambiguation list — «1) Russian band 2) Argentinian…». */
export function isArtistDisambiguationListSeed(fact: string): boolean {
  const t = fact.trim();
  return /^\d+\)\s/.test(t) && /\b\d+\)\s/.test(t.slice(3));
}

/** Song-page opener with production/vocal/chart context — not a throwaway «X is a song by Y». */
export function hasSongPageNarrativeDetail(fact: string): boolean {
  return /\b(?:in an interview|said that|called (?:it|the|the song)|protest|banned|viral on|went viral|tiktok|scandal|surprise hit|unexpected hit|inspired by|sampled from)\b/i.test(
    fact,
  );
}

/** Wikipedia «"Title" is a song by…» — metadata, not a radio story hook (even with uncredited vocals). */
export function isWeakWikiSongIntroSeed(fact: string): boolean {
  const t = fact.trim();
  if (hasSongPageNarrativeDetail(t)) return false;
  if (
    /\bis\s+a\s+song\s+by\b/i.test(t) ||
    /^"[^"]{1,90}"\s+is\s+(?:an?\s+)?(?:song|single|track)\b/i.test(t) ||
    /\bis\s+(?:an?\s+)?(?:pop|rock|dance|electronic|hip[- ]?hop|r[\s&]b|country|folk|jazz|soul|metal|indie)\s+(?:song|single|track)\s+by\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

function isBareSongDefinitionLine(fact: string): boolean {
  return isWeakWikiSongIntroSeed(fact);
}

/** Dictionary/literary page bleed — «cliché» the word, not mgk track. */
/** Also Wikipedia one-liners: «"Sorry" is a song by…» — not a story hook. */
export function isEncyclopediaDefinitionSeed(fact: string): boolean {
  const t = fact.trim();
  if (highImpactBonus(t) >= 6) return false;
  if (hasSongPageNarrativeDetail(t)) return false;
  if (
    /\b(?:inspired by|sampled from|written as|wrote (?:it|this|the song)|intended as|protest song|viral on|went viral|banned from|scandal|originally wrote|co-written|co written)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  if (isBareSongDefinitionLine(t)) return true;
  if (
    /\b(?:song|single|track)\s+originally\s+(?:performed|recorded|released)\s+by\b/i.test(t) ||
    /\bis\s+(?:an?\s+)?(?:pop|rock|hip[- ]?hop|r[\s&]b|dance|electronic|country|folk|jazz|soul|metal|indie)\s+(?:song|single|track)\s+originally\b/i.test(t) ||
    /\bis\s+(?:an?\s+)?(?:song|single|track)\s+(?:by|recorded\s+by)\b/i.test(t) ||
    /\bis\s+(?:an?\s+)?(?:song|single|track)\s+from\b/i.test(t) ||
    /^"[^"]{1,90}"\s+is\s+(?:an?\s+)?(?:song|single|track)\b/i.test(t) ||
    /^"[^"]{1,90}"\s+is\s+(?:an?\s+)?(?:pop|rock|hip[- ]?hop|r[\s&]b|dance|electronic|country|folk|jazz|soul|metal|indie)\b/i.test(t) ||
    /^«[^»]{1,90}»\s+(?:—|-)\s+(?:песня|сингл|трек)\b/i.test(t)
  ) {
    return true;
  }
  return (
    /\b(?:French poet|G[eé]rard de Nerval|Nerval once said)\b/i.test(t) ||
    /\bA clich[eé] is\b/i.test(t) ||
    /\bclich[eé] is a (?:phrase|figure|literary)\b/i.test(t) ||
    /\bcompared a woman to a rose\b/i.test(t) ||
    /\b(?:literary device|figure of speech|rhetorical device)\b/i.test(t) ||
    (/\b(?:term for|means a|defined as|refers to a)\b/i.test(t) &&
      /\bclich[eé]\b/i.test(t) &&
      !/\b(?:song|single|track|album|mgk|machine gun kelly|colson baker)\b/i.test(t))
  );
}

export function isDedicatedCatalogSeed(fact: string): boolean {
  if (isAlbumListingSeed(fact)) return false;
  if (isCatalogMetadataSeed(fact)) return false;
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
  /\b(?:song|single|track)\s+originally\s+(?:performed|recorded|released)\s+by\b/i,
  /\boriginally\s+performed\s+by\b/i,
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
  /\b(?:bush\s+doof|music\s+video|official\s+video)\b/i,
  /\b(?:limited\s+edition|vinyl|pressing|bootleg|b[- ]?side|cassette|7[- ]?inch)\b/i,
  /\b(?:debut\s+single|lead\s+single)\b.*\b(?:since|first|only)\b/i,
  /\b(?:did\s+not\s+chart|charted)\b.*\b(?:until|following|after)\b/i,
  /\b(?:прорыв|тикток|стрим\w*|миллиард|миллион|хит\s+100|соавтор|бутлег|винил|лимитк)\b/i,
];

/** Wikipedia «Track listings» / 7-inch catalog lines — not a story seed. */
export function isWikiTrackListingSeed(fact: string): boolean {
  const t = fact.trim();
  return (
    /\b(?:7-inch|12-inch|CD:|DVD:|cassette:|vinyl:)\b/i.test(t) ||
    /\b(?:Track listings|Available iTunes|digital download)\b/i.test(t) ||
    /\b(?:Remix\)|Album Version)\s*–\s*\d:\d{2}\b/i.test(t)
  );
}

/** Перечисление локаций съёмок клипа — не семя для истории. */
export function isMusicVideoLocationSpam(fact: string): boolean {
  const t = fact.trim();
  if (/^It shows them\b/i.test(t)) return true;
  if (!/\b(?:music video|video shows|directed by|shot in)\b/i.test(t)) return false;
  const locationHits =
    t.match(
      /\b(?:Park|Shrine|district|Tokyo|street|school|bicycle|impersonator|Academy|entertainment|neighborhood|filmed in|shows the band)\b/gi,
    )?.length ?? 0;
  return locationHits >= 2 || t.length > 220;
}

const THIN_RELEASE_ORDINAL_EN =
  '(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|lead|debut)';
const THIN_RELEASE_ORDINAL_RU =
  '(?:перв\\w*|втор\\w*|трет\\w*|четв[её]рт\\w*|пят\\w*|шест\\w*|седьм\\w*|восьм\\w*)';

/** «N-й сингл/трек с альбома X» — каталог, не история; LLM выдумает «фанаты заставили выпустить». */
export function isThinReleaseCatalogSeed(fact: string): boolean {
  const t = fact.trim();
  if (!t) return false;

  const ordinalSingleRe = new RegExp(`\\b${THIN_RELEASE_ORDINAL_EN}\\s+single\\b`, 'i');
  const ordinalTrackRe = new RegExp(`\\b${THIN_RELEASE_ORDINAL_EN}\\s+track\\b`, 'i');
  const ordinalSingleRuRe = new RegExp(`${THIN_RELEASE_ORDINAL_RU}\\s+сингл`, 'i');
  const ordinalTrackRuRe = new RegExp(`${THIN_RELEASE_ORDINAL_RU}\\s+трек`, 'i');
  const asOrdinalSingleRe = new RegExp(
    `\\bas\\s+(?:the|a)\\s+(?:album'?s\\s+)?${THIN_RELEASE_ORDINAL_EN}\\s+single\\b`,
    'i',
  );
  const releasedAsSingleRe = new RegExp(
    `\\breleased(?:\\s+on[^.;]{0,60})?\\s+as\\s+(?:the|a)\\s+(?:album'?s\\s+)?${THIN_RELEASE_ORDINAL_EN}\\s+single\\b`,
    'i',
  );
  const servesAsTrackRe = new RegExp(
    `\\bserves\\s+as\\s+(?:the\\s+)?${THIN_RELEASE_ORDINAL_EN}\\s+track\\b`,
    'i',
  );

  const isPlacement =
    asOrdinalSingleRe.test(t) ||
    (ordinalSingleRe.test(t) &&
      /\b(?:from|off(?:\s+of)?)\s+(?:their|the|his|her|its)\b/i.test(t)) ||
    releasedAsSingleRe.test(t) ||
    (/\bas\s+a\s+digital\s+download\b/i.test(t) && ordinalSingleRe.test(t)) ||
    (ordinalTrackRe.test(t) && /\balbum\b/i.test(t)) ||
    servesAsTrackRe.test(t) ||
    ordinalSingleRuRe.test(t) ||
    (ordinalTrackRuRe.test(t) && /\bальбом/i.test(t)) ||
    /\b(?:вышел|вышла|вышло)\s+как\s+(?:перв\w*|втор\w*|трет\w*|четв[её]рт\w*|пят\w*|шест\w*)\s+сингл/i.test(
      t,
    ) ||
    /\b(?:third|second|fourth|fifth|sixth|seventh|eighth)\s+track\s+on\s+(?:their|the)\b/i.test(
      t,
    );

  if (!isPlacement) return false;

  if (
    /\b(?:sampled|sample from|inspired\s+by|written\s+(?:about|after|with|during)|meaning|metaphor|protest|scandal|controvers|banned|billboard\s+hot|grammy|platinum|gold|viral|not\s+(?:originally\s+)?(?:intended|planned|meant)\s+(?:as\s+a\s+single|for\s+release)|fans\s+(?:demanded|requested|forced)|audience\s+(?:made|turned))\b/i.test(
      t,
    ) ||
    /\b(?:написан(?:а|о)|вдохновл(?:ён|ена|ено)|протест|скандал|фанаты\s+(?:потребовал|заставил|просил)|не\s+планировал\w*\s+выпускать)\b/i.test(
      t,
    )
  ) {
    return false;
  }

  return true;
}

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

/** Клип / съёмки / VHS — не семя: проект про песню и артистов, не про видео. */
const MUSIC_VIDEO_CONTENT =
  /\b(?:music video|official video|the video|video was|video is|video shoot|video premiere|video for|promotional video|accompanying music video|directed by|filmed (?:in|at|on|by)|camcorder|vhs|found footage|mockumentary|premiered on mtv|speaking of the video|video to mtv|put into visuals|general theme of the song.*visuals?|scripts from.*directors|read through a ton of scripts|клип(?:а|ом|е|у)?|режисс(?:ё|е)р(?:ом|а|у)?|снимал(?:ся|и)?\s+клип)\b/i;

export function isMusicVideoContentSeed(fact: string): boolean {
  return MUSIC_VIDEO_CONTENT.test(fact.trim());
}

/** @deprecated use isMusicVideoContentSeed — kept for import sites */
export function isGenericMusicVideoSeed(fact: string): boolean {
  return isMusicVideoContentSeed(fact);
}

const RECORDING_BACKSTORY_PATTERNS: RegExp[] = [
  /\b(?:uncredited vocals?|hidden vocal|guest vocal|session vocalist|vocals (?:were|was) (?:provided|performed) by)\b/i,
  /\b(?:writing session|wrote the lyrics|co[- ]?wrote with|recorded (?:in|at)|demo (?:version|tape)|originally intended|last[- ]minute|surprise vocal|overdub)\b/i,
  /\b(?:arrangement was developed|developed in the studio|backing vocals|layered over|arranged in the studio)\b/i,
  /(?:не\s+засветил\w*|скрыт\w*\s+вокал|сессионн\w*\s+вокал|соавтор(?:ил|ила|ство))/i,
];

export function isRecordingBackstorySeed(fact: string): boolean {
  return RECORDING_BACKSTORY_PATTERNS.some((p) => p.test(fact.trim()));
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BACKSTAGE_DRAMA_PATTERNS: RegExp[] = [
  /\b(?:conflict|scandal|controvers|banned|refused|lawsuit|argued|ultimatum|nearly|disagreed|reject(?:ed|ion)?|fight(?:s|ing)?\s+(?:breaks?|emerg(?:e|es|ed)|erupts?))\b/i,
  /(?:скандал|конфликт|запрет|отказ|суд|плагиат|ссор|ультиматум|почти не|отверг)/i,
];

export function isBackstageDramaSeed(fact: string): boolean {
  return BACKSTAGE_DRAMA_PATTERNS.some((p) => p.test(fact.trim()));
}

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
  const quoteNorm = trimmed.replace(/[\u201c\u201d\u2018\u2019]/g, '"');
  if (/The song(?:'|')s title comes from/i.test(quoteNorm)) return 22;
  if (/\bdescribes the pain of a man feeling left out in a love triangle\b/i.test(quoteNorm)) return 20;
  if (isCitationBibliographySeed(trimmed)) return -40;
  if (isListeningStatsFact(trimmed)) return -100;
  if (isGenericConcertVenueSeed(trimmed)) return -25;
  if (isCatalogMetadataSeed(trimmed)) return -30;
  if (isMusicVideoContentSeed(trimmed)) return -45;
  if (isWeakWikiSongIntroSeed(trimmed)) return -28;
  if (isLyricsPageSeed(trimmed)) score -= 50;
  if (isTrackMeaningNarrativeSeed(trimmed)) score += 32;
  if (isArtistIdentityBioSnippet(trimmed)) score += 16;
  if (/\bhailing from\b/i.test(trimmed) && /\b(?:latvia|latvian|lithuania|estonia|ukraine|russia|rezekne|rīga|riga)\b/i.test(trimmed)) {
    score += 12;
  }
  if (
    /\breleased(?:\s+on)?\b/i.test(trimmed) &&
    /\b(?:label|single|sap+hire|℗|©)\b/i.test(trimmed) &&
    /\b20\d{2}\b/.test(trimmed)
  ) {
    score += 10;
  }
  if (/«[\p{L}\p{N}\s'().-]+»/u.test(trimmed) && /(?:написал|родился|группа|альбом|Sanremo|Eurovision|стил|prod|сингл)/iu.test(trimmed)) {
    score += 14;
  }
  if (isTruncatedMarketingSnippet(trimmed)) score -= 40;
  if (isUnspeakableWebSeed(trimmed)) score -= 50;
  if (isStudioEquipmentCatalogSeed(trimmed)) score -= 55;
  if (isCollectorFact(fact)) score += 8;
  if (isDedicatedCatalogSeed(trimmed)) score += 12;
  if (
    /Трек «[^»]+» вошёл в альбом/i.test(trimmed) &&
    /\b(?:Recorded|Mixed|mastered|Studio|studios?)\b/i.test(trimmed) &&
    !isStudioEquipmentCatalogSeed(trimmed)
  ) {
    score += 14;
  }
  if (isTrackDurationCatalogSeed(trimmed)) score -= 10;
  if (/^[«"']/.test(quoteNorm) && /\b(?:first|new|debut|lead|collaboration|song)\b/i.test(quoteNorm)) {
    score += 18;
  }
  if (/^[«"'][\p{L}\p{N}\s'-]{2,40}[»"']\s+is a\b/iu.test(quoteNorm) && !isWeakWikiSongIntroSeed(trimmed)) score += 16;
  if (/\b(?:first new (?:song|music|single)|announced (?:a )?new ep|new lead singer)\b/i.test(trimmed)) {
    score += 14;
  }
  if (/\bco[- ]?written\b/i.test(trimmed)) score += 18;
  if (/\b(?:first teased|teased during|Clancy World Tour|Tyler stated|listening events)\b/i.test(trimmed)) {
    score += 18;
  }
  if (
    /\b(?:frontman|lead singer|vocalist|bassist|guitarist|drummer|singer)\b/i.test(trimmed) &&
    /\b(?:has said|said that|told|explained|revealed|admitted|stated that)\b/i.test(trimmed)
  ) {
    score += 22;
  }
  if (/\bhigh airplay\b/i.test(trimmed) && /\b(?:United States|Canada|radio|stations)\b/i.test(trimmed)) {
    score += 18;
  }
  if (/\b(?:can't escape|endless cycle|running away)\b/i.test(trimmed)) score += 12;
  if (/соавторил\w*/i.test(trimmed)) score += 14;
  if (/После распада/i.test(trimmed) && /\b(?:Police|Sting|сольн)/i.test(trimmed)) score += 16;
  if (/\b(?:card(?:sharp|player|game)?|blackjack|poker|playing cards)\b/i.test(trimmed)) score += 10;
  if (/\b(?:Leon|L[eé]on: The Professional|Eric Serra)\b/i.test(trimmed)) score += 12;
  if (/\b(?:deathtronica|electronicore|metalcore|hardcore|scream\s+vocals?)\b/i.test(trimmed)) score += 20;
  if (isBackstageDramaSeed(trimmed)) score += 14;
  if (isRecordingBackstorySeed(trimmed)) score += 20;
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
  if (/\binspired by the music of\b/i.test(fact)) score += 14;
  if (/\b(?:anti-war|protest song|political protest)\b/i.test(fact)) score += 14;
  if (/\bwrote (?:this song|the song) about (?:his|her|their)\b/i.test(fact)) score += 24;
  if (/\bcomposed primarily by\b.*\bas an ode to\b/i.test(fact)) score += 20;
  if (/^["'][\p{L}\p{N}\s'-]+["']\s+is a song by the (?:rock )?band\b/iu.test(quoteNorm)) score -= 28;
  if (/\bstarted writing (?:his|her|their|my|)?\s*(?:deeply personal )?(?:songs|music) at age \d+/i.test(fact)) {
    score += 18;
  }
  if (
    /\b(?:band|group)\b/i.test(fact) &&
    /\b(?:blues|rock|metal|pop-punk|dream-pop|post-punk)\b/i.test(fact) &&
    /\bfrom [A-Za-z]/i.test(fact)
  ) {
    score += 16;
  }
  // Taxman и подобные: налоги как смысл песни, не «энциклопедия».
  if (
    /\b(?:95\s*%|95\s*percent|top rate|tax rate|income tax|super[- ]?tax|one for you)\b/i.test(fact) &&
    /\b(?:wrote|written|inspired|response|complain|protest|harrison|beatles|revolver|taxman|song)\b/i.test(
      fact,
    )
  ) {
    score += 24;
  }
  if (/\b(?:intended to reflect|refrain.*intended|chorus.*intended)\b/i.test(fact)) score += 12;
  if (/The song(?:'|')s title comes from/i.test(quoteNorm)) score += 16;
  if (/\b(?:new musical elements|vocal counterpoint|incorporates a lot of new)\b/i.test(fact)) score += 14;
  if (/\bwas inspired by\b/i.test(fact) && /\b(?:Dylan|Beatles|Hendrix|Cohen|Springsteen)\b/i.test(fact)) {
    score += 8;
  }
  // Genius / narrative parser facts (не chart-trivia).
  if (/\b(?:widely considered|grunge anthem|ultimate grunge|song'?s success|omnipresence|grew tired of it|removed it from their live)\b/i.test(fact)) {
    score += 14;
  }
  if (/\b(?:deodorant|Hanna was referring|inspired the title|wrote the song in)\b/i.test(fact)) score += 10;
  if (
    /\b(?:MP3|MPEG|Fraunhofer|Brandenburg)\b/i.test(trimmed) &&
    /\b(?:encoding|encoded|codec|compression|reference|test(?:ing)?|format|layer 3)\b/i.test(trimmed)
  ) {
    score += 18;
  }
  if (/\b(?:acapella|a cappella)\b/i.test(trimmed) && /\b(?:1981|written|recorded|composed)\b/i.test(trimmed)) {
    score += 10;
  }
  if (/(?:написал\w*|сочинил\w*|автором текста).*(?:Цой|цой|«Кино»|Кино)/i.test(fact)) score += 10;
  if (/\b(?:intended to|repudiat\w*|members? of the (?:band|group|four)|their past|dark past)\b/i.test(fact)) score += 8;
  score += highImpactBonus(fact);
  if (isThinReleaseCatalogSeed(fact)) score -= 40;
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
  if (isListeningStatsFact(trimmed)) return true;
  if (isTrackMeaningNarrativeSeed(trimmed)) return false;
  if (isRecordingBackstorySeed(trimmed)) return false;
  if (isCitationBibliographySeed(trimmed)) return true;
  if (isGenericConcertVenueSeed(trimmed)) return true;
  if (isCatalogMetadataSeed(trimmed)) return true;
  if (isMusicVideoContentSeed(trimmed)) return true;
  if (isStudioEquipmentCatalogSeed(trimmed)) return true;
  if (isThinReleaseCatalogSeed(trimmed)) return true;
  if (isMusicVideoLocationSpam(trimmed)) return true;
  if (isWikiTrackListingSeed(trimmed)) return true;
  if (isDedicatedCatalogSeed(trimmed)) return false;
  if (isWikiBiographyLead(trimmed)) return true;
  if (isCollectorFact(trimmed)) return false;
  if (isBareSongDefinitionLine(trimmed)) return true;
  if (isWeakWikiSongIntroSeed(trimmed)) return true;
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
    .filter((fact) => !isListeningStatsFact(fact))
    .filter((fact) => !isThinReleaseCatalogSeed(fact))
    .sort((a, b) => interestScore(b) - interestScore(a))
    .filter((fact) => !isBoringFact(fact))
    .slice(0, max);
}

/** Fact reads like a soulful human story anchor. */
export function isBackstoryFact(fact: string): boolean {
  return BACKSTORY_FACT_PATTERNS.some((pattern) => pattern.test(fact));
}
