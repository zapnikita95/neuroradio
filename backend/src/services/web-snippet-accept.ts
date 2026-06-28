import {
  factMentionsArtist,
  factMentionsArtistLoose,
  factMentionsOtherTrackTitle,
  factMentionsTitle,
  factNamesForeignEntity,
  hasTrackContextSignal,
  isWebListicleJunk,
} from './fact-relevance.js';
import {
  interestScore,
  isBackstoryFact,
  isBoringFact,
  isCatalogMetadataSeed,
  isCitationBibliographySeed,
  isGenericConcertVenueSeed,
  isGenericMusicVideoSeed,
  isStudioEquipmentCatalogSeed,
  isTrackMeaningNarrativeSeed,
  isArtistFormationBioSeed,
} from './reference-fact-quality.js';
import { isTrackTitleAnchoredSeed } from './fact-track-anchor.js';
import { lookupArtistPronunciation } from './artist-pronunciation.js';

const LOW_QUALITY_WEB_PREFIX =
  /^(?:Explore songs|Be the first to comment|Provided to YouTube|Nobody|Add your thoughts|Watch exclusive videos|There have been few stars)/i;

/** HTML search junk — not story seeds. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

const TRUNCATED_MARKETING =
  /^(?:It'?s easy to understand why|Delve into the|Join professional|Explore songs|The most successful and the best-known is|Getting your Trinity Audio|Watch exclusive videos|This document provides|Early Life and Career Beginnings|If history is any guide)/i;

/** SEO clip cut mid-sentence but still a usable emerging-artist hook. */
export function isEmergingArtistNarrativeSnippet(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  return (
    trimmed.length >= 40 &&
    /\b(?:busk(?:ing|ed|s)?|tiktok|madison square garden|meteoric rise|rose to fame|viral on|posting covers|emerging musician|town center|street musician|first rose to fame|covers and original|joining .* on tour|verified,)\b/i.test(
      trimmed,
    )
  );
}

/** Truncated press/listicle about a hit song — Latin/English hooks. */
export function isHitTrackNarrativeSnippet(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (trimmed.length < 35) return false;
  return (
    /\b(?:heartbreak|harmony|launched in|summer hit|worldwide hit|chart|grammy|billboard|neo-fasc|controvers|misappropriat|dedic(?:at|ó)|esposa|álbum|album mi sangre|mi sangre|karaoke|entérate|escribi[óo]|inspir(?:ed|ada)|written by|origin(?:ated|ó)|festival|soundtrack|film|movie)\b/i.test(
      trimmed,
    ) ||
    /\b(?:From .+ to .+ Launched|known professionally as|transl\.|black shirt)\b/i.test(trimmed)
  );
}

/** SEO/listicle fragment — not a speakable fact. */
export function isTruncatedMarketingSnippet(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (isEmergingArtistNarrativeSnippet(trimmed)) return false;
  if (isHitTrackNarrativeSnippet(trimmed)) return false;
  if (TRUNCATED_MARKETING.test(trimmed)) return true;
  if (/\b(?:detailed summary and analysis|provides a detailed summary)\b/i.test(trimmed)) return true;
  if (trimmed.length < 55 && !/[.!?…]["']?\s*$/.test(trimmed)) return true;
  if (
    !/[.!?…]["']?\s*$/.test(trimmed) &&
    /\b(?:for|of|to|the|a|an|in|on|with|and|by|at|from|into|his|her|their)\s*$/i.test(trimmed)
  ) {
    return true;
  }
  if (/\b(?:drawn to|impact of|lasting impact of|raw emotion,? poignant lyrics)\s*$/i.test(trimmed)) {
    return true;
  }
  return false;
}

/** Страницы текстов / SEO — не семя для истории (даже если есть год и альбом). */
export function isLyricsPageSeed(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (isTrackMeaningNarrativeSeed(trimmed)) return false;
  if (/\blyrics here lamenting\b/i.test(trimmed)) return false;
  if (/\bwritten from the perspective\b/i.test(trimmed)) return false;
  if (
    /\b(?:текст\s+(?:пісн|песн|песни)|lyrics|songtext|letras|слова\s+песни|текст\s+песни)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/Текст\s+пісні|Текст\s+песни|song\s+lyrics|genius\.com/i.test(trimmed)) return true;
  if (/[\u{1F300}-\u{1FAFF}]/u.test(trimmed)) return true;
  if (/\b(?:дешевле|mini\s+tractor|міні\s+трактор|купи|скидк|реклам|click here)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

/** Wikidata/DDG перепутал артиста с одноимённым предметом (Boombox = магнитола). */
export function isWrongEntityDisambiguation(snippet: string, artist: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  const artistKey = artist.trim().toLowerCase();
  if (!artistKey) return false;
  if (
    (artistKey === 'бумбокс' || artistKey === 'boombox') &&
    /\b(?:portable|stereo|cassette\s+recorder|ghetto\s+blaster|audio\s+equipment|electronic\s+device)\b/i.test(
      trimmed,
    ) &&
    !/\b(?:ukrainian|band|group|musical|artist|song|album|rapper|rock)\b/i.test(trimmed)
  ) {
    return true;
  }
  if (
    (artistKey === 'voodoo' || artistKey === 'vodoo' || artistKey === 'voodo') &&
    /\b(?:haiti|haitian|religion|spiritual|festival|100[,.\s]?000|vodou|voudou)\b/i.test(trimmed) &&
    !/\b(?:song|single|track|album|artist|band|released|recorded|chart|music video)\b/i.test(trimmed)
  ) {
    return true;
  }
  if (
    artistKey === 'helmut' &&
    /\b(?:german|politician|actor|football|soccer|president|minister|born in \d{4})\b/i.test(trimmed) &&
    !/\b(?:band|musician|singer|rapper|dj|producer|song|album|track|released)\b/i.test(trimmed)
  ) {
    return true;
  }
  if (
    /\bachille lauro\b/i.test(artistKey) &&
    /\b(?:denver|colorado)\b/i.test(trimmed) &&
    !/\b(?:italian|sanremo|eurovision|pop-punk|rapper|singer)\b/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/** Strip markdown/wiki chrome from Jina page extracts before storing or speaking. */
export function sanitizeHarvestFactText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[\[\d+\]\]\([^)]+\)/g, '')
    .replace(/#cite_note-\d+\)?/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\*\*\[\^\]\([^)]+\)\*\*/g, '')
    .replace(/\[\[edit\][^\]]*\]/gi, '')
    .replace(/\*{2,}/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wikipedia table/nav junk — not a fact sentence. */
export function isWikiMarkupJunkFact(fact: string): boolean {
  const trimmed = sanitizeHarvestFactText(fact);
  if (trimmed.length < 35) return true;
  if (/служебная:указатель|найти страницы, начинающиеся|pages that start with/i.test(trimmed)) {
    return true;
  }
  if (/\[\[edit\]|edit section:/i.test(trimmed)) return true;
  if (/^\s*видеоклип\s*---|логотип youtube|upload\.wikimedia\.org/i.test(trimmed)) return true;
  if (/^[\[\|\*]{2,}/.test(trimmed)) return true;
  if (/\bcite_ref-\d+\b/i.test(trimmed)) return true;
  if (/^["[]/.test(trimmed) && /interview with max cavalera|nailbomb/i.test(trimmed)) return true;
  if (/^youtube\.?\s*$/i.test(trimmed) || /^youtube\.\[\[/i.test(trimmed)) return true;
  if (/list_of|cover_versions/i.test(trimmed)) return true;
  if (/w\/index\.php\?title=|action=edit&section=/i.test(trimmed)) return true;
  if ((trimmed.match(/https?:\/\//g) ?? []).length >= 2) return true;
  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function displayRuPronunciation(ru: string): string {
  const clean = ru.replace(/\+/g, '').trim();
  if (!clean) return clean;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Latin artist spellings → Cyrillic for bank/TTS (Eldzhey → Элджей). */
export function normalizeFactForBankStorage(artist: string, title: string, raw: string): string {
  let t = sanitizeHarvestFactText(raw).replace(/[\u200B-\u200D\uFEFF\uFFFD]/g, '');
  const names = new Set<string>();
  for (const part of artist.split(/\s*&\s*/)) names.add(part.trim());
  names.add(artist.trim());
  for (const name of names) {
    if (!name) continue;
    const entry = lookupArtistPronunciation(name);
    if (!entry) continue;
    const ru = displayRuPronunciation(entry.ru);
    const variants = [name, ...(entry.aliases ?? [])];
    for (const v of variants) {
      if (v.length < 3) continue;
      t = t.replace(new RegExp(`\\b${escapeRegExp(v)}\\b`, 'gi'), ru);
    }
  }
  for (const extra of ['Feduk', 'Фeduk']) {
    const entry = lookupArtistPronunciation(extra);
    if (entry) {
      const ru = displayRuPronunciation(entry.ru);
      t = t.replace(new RegExp(`\\b${escapeRegExp(extra)}\\b`, 'gi'), ru);
    }
  }
  return t.replace(/\s+/g, ' ').trim();
}

/** «The song became…» on artist wiki — not about the requested track. */
export function isGenericDeferredSongOpenerWithoutTitle(fact: string, title: string): boolean {
  if (factMentionsTitle(fact, title)) return false;
  const t = fact.trim();
  return (
    /^(?:The song|The video|The single|The track)\b/i.test(t) ||
    /\bmost[- ]watched\b.*\b(?:russian|language)\b.*\byoutube\b/i.test(t) ||
    /\bviral sensation\b.*\b(?:youtube|most[- ]watched)\b/i.test(t) ||
    /\b(?:imya|имя)\s*505\b/i.test(t)
  );
}

/** RU catalog track but fact is English boilerplate without naming the title. */
export function isEnglishOnlyFactForCyrillicTrack(artist: string, title: string, fact: string): boolean {
  if (!/[\u0400-\u04FF]/.test(`${artist} ${title}`)) return false;
  if (factMentionsTitle(fact, title)) return false;
  const letters = fact.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 20) return false;
  const cyr = fact.match(/[\u0400-\u04FF]/g)?.length ?? 0;
  return cyr / letters < 0.2;
}

/** SEO, Reddit, platform UI — not a speakable story seed. */
export function isUnspeakableWebSeed(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (isWikiMarkupJunkFact(trimmed)) return true;
  if (isCitationBibliographySeed(trimmed)) return true;
  if (isGenericConcertVenueSeed(trimmed)) return true;
  if (isLyricsPageSeed(trimmed)) return true;
  if (isTruncatedMarketingSnippet(trimmed)) return true;
  if (LOW_QUALITY_WEB_PREFIX.test(trimmed)) return true;
  if (
    /\b(?:sub\s*reddit|subreddit|subscribers?\s+in\s+the|\d[\d,.]*K?\s+subscribers?|dedicated to everything about|community\.?\s*A sub)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/\bbrowse all\b|welcome to our daily|studio version\s*\/\s*music video/i.test(trimmed)) {
    return true;
  }
  if (/\bwritten by\b/i.test(trimmed) && /\bbrowse all\b/i.test(trimmed)) return true;
  if (
    /\b\d[\d,.]*K\b/i.test(trimmed) &&
    !/\b(?:wrote|written|recorded|album|song|track|band|duo|artist|single|chart|grammy|video|directed|advertisement|newspaper|formed|met|трек|треков|песн|альбом|стрим)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

/** Playlist / multi-track SEO line — not a fact about the requested artist. */
export function isPlaylistJunkSnippet(snippet: string, artist: string, title: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (factMentionsArtist(trimmed, artist) || factMentionsTitle(trimmed, title)) return false;
  const dashPairs = (trimmed.match(/\s[-–—]\s/g) ?? []).length;
  if (dashPairs >= 2) return true;
  if (/\bOfficial Music Video\b/i.test(trimmed) && dashPairs >= 1) return true;
  if (
    /\b(?:Kate Bush|Lana Del Rey|Lykke Li|Taylor Swift|Adele|Nirvana|Coldplay)\b/i.test(trimmed) &&
    dashPairs >= 1
  ) {
    return true;
  }
  return false;
}

/** Fact strong enough to anchor LLM output + quality gate. */
export function isSpeakableReferenceFact(
  fact: string,
  artist = '',
  title = '',
): boolean {
  const trimmed = decodeHtmlEntities(fact).trim();
  if (trimmed.length < 35) return false;
  if (isWrongEntityDisambiguation(trimmed, artist)) return false;
  if (isUnspeakableWebSeed(trimmed)) return false;
  if (isWebListicleJunk(trimmed)) return false;
  if (artist && isPlaylistJunkSnippet(trimmed, artist, title)) return false;
  if (title && isTrackTitleAnchoredSeed(trimmed, title)) {
    return interestScore(trimmed) >= 6 || (trimmed.length >= 55 && /«[^»]+»/.test(trimmed));
  }
  if (
    isBoringFact(trimmed) &&
    !isBackstoryFact(trimmed) &&
    !isArtistIdentityBioSnippet(trimmed) &&
    !isArtistFormationBioSeed(trimmed) &&
    !isArtistBackstoryNarrative(trimmed)
  ) {
    return false;
  }
  if (/«[^»]{2,60}»/.test(trimmed) && trimmed.length >= 55) return true;
  return (
    interestScore(trimmed) >= 6 ||
    isBackstoryFact(trimmed) ||
    isArtistIdentityBioSnippet(trimmed) ||
    isArtistFormationBioSeed(trimmed) ||
    isArtistBackstoryNarrative(trimmed)
  );
}

export function isLowQualityWebSnippet(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (trimmed.length < 35) return true;
  if (isUnspeakableWebSeed(trimmed)) return true;
  if (LOW_QUALITY_WEB_PREFIX.test(trimmed)) return true;
  if (/^[\d.]+\.\s/.test(trimmed)) return true;
  if (/©\w{2,}\b|©Reddit/i.test(trimmed)) return true;
  if (/other album details for\s*$/i.test(trimmed)) return true;
  return false;
}

/** Press/label bio line — «сольный проект X, известный как…» (GALAGA / indie rap). */
export function isArtistBackstoryNarrative(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (trimmed.length < 30) return false;
  return (
    /\bstarted writing (?:his|her|their|my|)?\s*(?:deeply personal )?(?:songs|music) at age \d+/i.test(
      trimmed,
    ) ||
    /\bborn in [A-Za-zÀ-ÿ][^.]{0,80}(?:father|mother|parents|German|Spanish|Italian|Japanese)/i.test(
      trimmed,
    ) ||
    (/\b(?:band|group|artist)\b/i.test(trimmed) &&
      /\bfrom (?:Geneva|Barcelona|Oxford|Minneapolis|Los Angeles|Denver|Italy|Spain|Switzerland)\b/i.test(
        trimmed,
      )) ||
    /\b(?:jumps in to produce|produced (?:by|their)|Gojira)\b/i.test(trimmed) ||
    /\bwrote (?:this song|the song) about (?:his|her|their)\b/i.test(trimmed) ||
    /\bcomposed primarily by\b.*\bas an ode to\b/i.test(trimmed) ||
    /\b(?:Eurovision|Sanremo|represented San Marino)\b/i.test(trimmed) ||
    /\b(?:pop-punk|dream-pop|post-punk|metalcore|blues\s*\/\s*rock)\b/i.test(trimmed)
  );
}

/** Press/label bio line — «сольный проект X, известный как…» (GALAGA / indie rap). */
export function isArtistIdentityBioSnippet(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (trimmed.length < 35 || trimmed.length > 480) return false;
  if (isLyricsPageSeed(trimmed)) return false;
  return (
    /(?:сольный проект|известн(?:ый|ого|ая|ой|ым)\s+как|вокалист(?:а|ом)?|создател\w*\s+групп|участник\s+групп|русск\w*\s+рэп|russian rap|musician biography|rapper biography|stage name|псевдоним)/i.test(
      trimmed,
    ) ||
    /\bknown (?:professionally as|by (?:his|her|their) moniker)\b/i.test(trimmed) ||
    /\bhailing from\b/i.test(trimmed) ||
    /\belectronic (?:music )?artist\b/i.test(trimmed) ||
    (/(?:артист|исполнитель|музыкант|rapper|musician|singer[- ]?songwriter|recording artist|lead singer)/i.test(trimmed) &&
      /(?:родился|род\.|born|project of|member of|ex-|hailing from)/i.test(trimmed))
  );
}

/** Narrative hook in a search snippet — even without repeating artist/title. */
export function hasNarrativeSeedSignal(text: string): boolean {
  const trimmed = text.trim();
  if (isCatalogMetadataSeed(trimmed)) return false;
  if (isCitationBibliographySeed(trimmed)) return false;
  if (isGenericConcertVenueSeed(trimmed)) return false;
  if (isGenericMusicVideoSeed(trimmed)) return false;
  if (isStudioEquipmentCatalogSeed(trimmed)) return false;
  if (isArtistIdentityBioSnippet(trimmed)) return true;
  if (hasTrackContextSignal(trimmed)) return true;
  if (isBackstoryFact(trimmed)) return true;
  if (
    /\b(?:intended to|written to|meant to|repudiat\w*|controvers\w*|scandal|far[- ]?right|extremist|Eurovision|documentary|members? of|their past|qualify for|failed to qualify|involved in a|dark past|reunion|comeback|breakup|reformed)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/\b(?:apology|explained|said in an interview|revealed|admitted|denied)\b/i.test(trimmed)) {
    return true;
  }
  if (isEmergingArtistNarrativeSnippet(trimmed)) return true;
  return interestScore(trimmed) >= 6;
}

/** Relaxed accept for indie / emerging artists — truncated press clips OK. */
export function acceptIndieEmergingSnippet(
  snippet: string,
  artist: string,
  title: string,
): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (trimmed.length < 35 || trimmed.length > 480) return false;
  if (isLowQualityWebSnippet(trimmed)) return false;
  if (isWebListicleJunk(trimmed)) return false;
  if (isPlaylistJunkSnippet(trimmed, artist, title)) return false;

  // Artist bio lines often quote a former band — must not be blocked as «other track title».
  if (isArtistIdentityBioSnippet(trimmed) && factMentionsArtistLoose(trimmed, artist)) return true;

  if (factMentionsOtherTrackTitle(trimmed, title)) return false;

  // Search was scoped to artist+title — truncated rise/fame clips need not repeat the name.
  if (isEmergingArtistNarrativeSnippet(trimmed)) return true;
  if (isHitTrackNarrativeSnippet(trimmed)) return true;

  if (factMentionsArtistLoose(trimmed, artist)) {
    if (acceptSearchGroundedSnippet(trimmed, artist, title)) return true;
    // Short bio/press lines — interest scorer often returns 0 for SEO clips.
    if (trimmed.length >= 40 && !isTruncatedMarketingSnippet(trimmed)) return true;
  }

  if (factMentionsTitle(trimmed, title)) {
    return (
      acceptSearchGroundedSnippet(trimmed, artist, title) ||
      (hasNarrativeSeedSignal(trimmed) && interestScore(trimmed) >= 3)
    );
  }

  return hasNarrativeSeedSignal(trimmed) && interestScore(trimmed) >= 4;
}

/** At least one snippet usable for seed/salvage — weak wikidata alone does not count. */
export function hasActionableSnippets(
  snippets: string[],
  artist: string,
  title: string,
): boolean {
  return snippets.some(
    (snippet) =>
      acceptSearchGroundedSnippet(snippet, artist, title) ||
      acceptIndieEmergingSnippet(snippet, artist, title) ||
      isHitTrackNarrativeSnippet(snippet),
  );
}

/**
 * Accept web search snippet as a grounded fact seed.
 * Search was for artist+title — narrative snippets need not repeat both names.
 */
export function acceptSearchGroundedSnippet(
  snippet: string,
  artist: string,
  title: string,
): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (isLowQualityWebSnippet(trimmed)) return false;
  if (isWebListicleJunk(trimmed)) return false;
  if (isPlaylistJunkSnippet(trimmed, artist, title)) return false;
  if (factMentionsOtherTrackTitle(trimmed, title)) return false;
  if (factNamesForeignEntity(trimmed, artist, title)) return false;

  const explicit =
    factMentionsTitle(trimmed, title) ||
    factMentionsArtistLoose(trimmed, artist) ||
    hasTrackContextSignal(trimmed);

  if (explicit) {
    return interestScore(trimmed) >= 3 || hasNarrativeSeedSignal(trimmed);
  }

  if (!hasNarrativeSeedSignal(trimmed)) return false;
  if (interestScore(trimmed) < 4) return false;
  return true;
}
