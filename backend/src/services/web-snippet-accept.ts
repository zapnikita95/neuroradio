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
  isArtistFormationBioSeed,
} from './reference-fact-quality.js';
import { isTrackTitleAnchoredSeed } from './fact-track-anchor.js';

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
  return false;
}

/** SEO, Reddit, platform UI — not a speakable story seed. */
export function isUnspeakableWebSeed(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
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
    return interestScore(trimmed) >= 6;
  }
  if (
    isBoringFact(trimmed) &&
    !isBackstoryFact(trimmed) &&
    !isArtistIdentityBioSnippet(trimmed) &&
    !isArtistFormationBioSeed(trimmed)
  ) {
    return false;
  }
  return (
    interestScore(trimmed) >= 6 ||
    isBackstoryFact(trimmed) ||
    isArtistIdentityBioSnippet(trimmed) ||
    isArtistFormationBioSeed(trimmed)
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
export function isArtistIdentityBioSnippet(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (trimmed.length < 35 || trimmed.length > 480) return false;
  if (isLyricsPageSeed(trimmed)) return false;
  return (
    /(?:сольный проект|известн(?:ый|ого|ая|ой|ым)\s+как|вокалист(?:а|ом)?|создател\w*\s+групп|участник\s+групп|русск\w*\s+рэп|russian rap|musician biography|rapper biography|stage name|псевдоним)/i.test(
      trimmed,
    ) ||
    /\bknown (?:professionally as|by (?:his|her|their) moniker)\b/i.test(trimmed) ||
    (/(?:артист|исполнитель|музыкант|rapper|musician|singer[- ]?songwriter|recording artist|lead singer)/i.test(trimmed) &&
      /(?:родился|род\.|born|project of|member of|ex-)/i.test(trimmed))
  );
}

/** Narrative hook in a search snippet — even without repeating artist/title. */
export function hasNarrativeSeedSignal(text: string): boolean {
  const trimmed = text.trim();
  if (isCatalogMetadataSeed(trimmed)) return false;
  if (isCitationBibliographySeed(trimmed)) return false;
  if (isGenericConcertVenueSeed(trimmed)) return false;
  if (isGenericMusicVideoSeed(trimmed)) return false;
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
