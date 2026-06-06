import {
  factMentionsArtist,
  factMentionsOtherTrackTitle,
  factMentionsTitle,
  hasTrackContextSignal,
  isWebListicleJunk,
} from './fact-relevance.js';
import {
  interestScore,
  isBackstoryFact,
  isBoringFact,
} from './reference-fact-quality.js';

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
  /^(?:It'?s easy to understand why|Delve into the|Join professional|Explore songs|The most successful and the best-known is|Getting your Trinity Audio|Watch exclusive videos)/i;

/** SEO/listicle fragment — not a speakable fact. */
export function isTruncatedMarketingSnippet(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (TRUNCATED_MARKETING.test(trimmed)) return true;
  if (trimmed.length < 55 && !/[.!?…]["']?\s*$/.test(trimmed)) return true;
  if (/\b(?:drawn to|impact of|lasting impact of|raw emotion,? poignant lyrics)\s*$/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function isLowQualityWebSnippet(snippet: string): boolean {
  const trimmed = decodeHtmlEntities(snippet).trim();
  if (trimmed.length < 35) return true;
  if (isTruncatedMarketingSnippet(trimmed)) return true;
  if (LOW_QUALITY_WEB_PREFIX.test(trimmed)) return true;
  if (/^[\d.]+\.\s/.test(trimmed)) return true;
  if (/©\w{2,}\b|©Reddit/i.test(trimmed)) return true;
  if (/other album details for\s*$/i.test(trimmed)) return true;
  return false;
}

/** Narrative hook in a search snippet — even without repeating artist/title. */
export function hasNarrativeSeedSignal(text: string): boolean {
  const trimmed = text.trim();
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
  return interestScore(trimmed) >= 6;
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
  if (factMentionsOtherTrackTitle(trimmed, title)) return false;

  const explicit =
    factMentionsTitle(trimmed, title) ||
    factMentionsArtist(trimmed, artist) ||
    hasTrackContextSignal(trimmed);

  if (explicit) {
    return interestScore(trimmed) >= 3 || hasNarrativeSeedSignal(trimmed);
  }

  if (!hasNarrativeSeedSignal(trimmed)) return false;
  if (interestScore(trimmed) < 4) return false;
  return true;
}
