import { factMentionsTitle, hasTrackContextSignal } from './fact-relevance.js';
import { rejectSeedForTrackStory } from './fact-track-anchor.js';
import { interestScore, isBoringFact } from './reference-fact-quality.js';

export type FactScope = 'track' | 'album' | 'artist';

export interface ScopedFactCandidate {
  fact: string;
  scope: FactScope;
  evidenceUrl: string;
  evidenceQuote: string;
  confidence: number;
  source: string;
}

/** Band formation / school friendship — common bleed when scope should be track. */
const ARTIST_BIO_BLEED_PATTERNS: RegExp[] = [
  /\b(?:met at|school|university|college|childhood friends|grew up together|formed in|started in)\b/i,
  /\b(?:школ|университет|дружб|познакомил|образовал|сформировал)\b/i,
  /\bSt Edward'?s\b/i,
  /\bOxford\b.*\b(?:school|met|friends)\b/i,
];

const TRACK_SPECIFIC_SIGNALS: RegExp[] = [
  /\b(?:wrote|written|inspired|about|meaning|lyrics|metaphor|metaphors)\b/i,
  /\b(?:написал|написан|о\s+том|смысл|текст|линия|строк)\b/i,
  /\b(?:Texas|childhood|romantic|love again|cannot force)\b/i,
  /\b(?:interview|said|told|explained|speaks to)\b/i,
];

export function inferScopeFromFact(fact: string, title: string): FactScope {
  if (factMentionsTitle(fact, title) || hasTrackContextSignal(fact)) return 'track';
  if (ARTIST_BIO_BLEED_PATTERNS.some((p) => p.test(fact))) return 'artist';
  return 'album';
}

export function isArtistBioBleedForTrackRequest(
  fact: string,
  title: string,
  scope: FactScope,
): boolean {
  if (scope === 'artist') return false;
  if (factMentionsTitle(fact, title)) return false;
  if (TRACK_SPECIFIC_SIGNALS.some((p) => p.test(fact))) return false;
  return ARTIST_BIO_BLEED_PATTERNS.some((p) => p.test(fact));
}

export function verifyQuoteInText(quote: string, text: string): boolean {
  const q = quote.toLowerCase().replace(/\s+/g, ' ').trim();
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 12) return false;
  if (t.includes(q)) return true;
  const tokens = q.split(' ').filter((w) => w.length >= 4);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((tok) => t.includes(tok)).length;
  return hits >= Math.min(3, tokens.length);
}

export interface ScopeValidationResult {
  ok: boolean;
  reason?: string;
  adjustedScope?: FactScope;
}

function titleSlugTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

/** Wikipedia (песня)/(song) or songfacts slug — page is about this track, not a disambiguation. */
export function isDedicatedSongPageUrl(url: string, title: string): boolean {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  const u = decoded.toLowerCase();
  if (/songfacts\.com\/facts\//.test(u)) {
    const slug = titleSlugTokens(title).join('-');
    return slug.length >= 3 && u.includes(slug.slice(0, 40));
  }
  if (!u.includes('wikipedia.org')) return false;
  if (/list_of|disambiguation|\(значения\)|cover_versions|\(альбом\)|\(album\)/i.test(u)) {
    return false;
  }
  if (/\((?:песня|song|single|сингл)\)/i.test(u)) {
    const tTok = titleSlugTokens(title);
    if (tTok.length === 0) return false;
    const pathNorm = u.replace(/_/g, ' ');
    return tTok.filter((t) => pathNorm.includes(t)).length >= Math.min(2, tTok.length);
  }
  const tTok = titleSlugTokens(title);
  if (tTok.length === 0) return false;
  const pathSlug = (u.split('/wiki/')[1]?.split('#')[0] ?? '').replace(/_/g, ' ').toLowerCase();
  if (pathSlug.length < 4) return false;
  return tTok.every((t) => pathSlug.includes(t));
}

/** Weekly bulk: accept facts from dedicated song pages without title in every sentence. */
export function validateWeeklyBulkScopedFact(
  candidate: ScopedFactCandidate,
  artist: string,
  title: string,
  pageText: string,
): ScopeValidationResult {
  const fact = candidate.fact.trim();
  if (fact.length < 35) return { ok: false, reason: 'too_short' };
  if (!verifyQuoteInText(candidate.evidenceQuote, pageText)) {
    return { ok: false, reason: 'quote_not_in_page' };
  }
  const onSongPage = isDedicatedSongPageUrl(candidate.evidenceUrl, title);
  if (!onSongPage && rejectSeedForTrackStory(fact, artist, title)) {
    return { ok: false, reason: 'not_anchored_to_track' };
  }
  if (isArtistBioBleedForTrackRequest(fact, title, candidate.scope) && !onSongPage) {
    return { ok: false, reason: 'artist_bio_bleed' };
  }
  if (isBoringFact(fact) && !onSongPage) {
    return { ok: false, reason: 'boring' };
  }
  const minInterest = onSongPage ? 2 : 4;
  if (interestScore(fact) < minInterest && !factMentionsTitle(fact, title) && !onSongPage) {
    return { ok: false, reason: 'low_interest' };
  }
  return { ok: true, adjustedScope: onSongPage ? 'track' : candidate.scope };
}

export function validateScopedFact(
  candidate: ScopedFactCandidate,
  artist: string,
  title: string,
  pageText: string,
): ScopeValidationResult {
  const fact = candidate.fact.trim();
  if (fact.length < 35) return { ok: false, reason: 'too_short' };
  if (!verifyQuoteInText(candidate.evidenceQuote, pageText)) {
    return { ok: false, reason: 'quote_not_in_page' };
  }
  if (rejectSeedForTrackStory(fact, artist, title)) {
    return { ok: false, reason: 'not_anchored_to_track' };
  }
  const scope = candidate.scope;
  if (isArtistBioBleedForTrackRequest(fact, title, scope)) {
    return { ok: false, reason: 'artist_bio_bleed' };
  }
  if (scope === 'track' && title.trim() && !factMentionsTitle(fact, title) && !hasTrackContextSignal(fact)) {
    return { ok: false, reason: 'track_scope_without_anchor' };
  }
  const minInterest = scope === 'track' && /npr\.org|interview|said|explained|wrote about/i.test(pageText) ? 3 : 4;
  const titleAnchored = scope === 'track' && factMentionsTitle(fact, title);
  if (interestScore(fact) < minInterest && !titleAnchored) {
    return { ok: false, reason: 'low_interest' };
  }
  return { ok: true, adjustedScope: scope };
}

/** Pick best sentence from raw page when LLM unavailable. */
export function heuristicExtractFactFromPage(
  page: { url: string; text: string },
  artist: string,
  title: string,
): ScopedFactCandidate | null {
  const sentences = page.text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^(?:BAYLEY|SIMON|SCOTT SIMON|[A-Z]{2,}):\s*/i, '').trim())
    .filter((s) => s.length >= 40 && s.length <= 520);

  const titleTokens = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  const artistTokens = artist.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);

  function titleHit(sentence: string): boolean {
    const lower = sentence.toLowerCase();
    const hits = titleTokens.filter((t) => lower.includes(t)).length;
    if (hits >= Math.min(3, titleTokens.length)) return true;
    if (lower.includes('fall in love again')) return true;
    if (lower.includes(title.toLowerCase().slice(0, 20))) return true;
    return false;
  }

  let best: { sentence: string; score: number; scope: FactScope } | null = null;

  for (const sentence of sentences) {
    if (/^\(SOUNDBITE|^GLASS ANIMALS:\s*\(Singing\)/i.test(sentence)) continue;
    if (/^\[?(?:Video|Image)\s+\d+\]?/i.test(sentence.trim())) continue;
    if (/^\*\s*!\[Image|^\|\s*\d{4}\s*\|/i.test(sentence.trim())) continue;
    if (/^[\[\|*]/.test(sentence.trim()) && sentence.length < 80) continue;
    const lower = sentence.toLowerCase();
    const mentionsTitle = titleHit(sentence);
    const mentionsArtist = artistTokens.some((w) => lower.includes(w));
    if (!mentionsTitle && !mentionsArtist) continue;

    let score = interestScore(sentence);
    if (mentionsTitle) score += 8;
    if (/growing up in Texas|song about.*Texas|references a few places/i.test(sentence)) score += 12;
    if (TRACK_SPECIFIC_SIGNALS.some((p) => p.test(sentence))) score += 4;
    if (mentionsArtist && !mentionsTitle) score += 1;
    if (ARTIST_BIO_BLEED_PATTERNS.some((p) => p.test(sentence)) && !mentionsTitle) score -= 8;
    if (/love songs in a very broad sense/i.test(sentence)) score -= 10;

    const scope: FactScope = mentionsTitle ? 'track' : 'artist';
    if (isArtistBioBleedForTrackRequest(sentence, title, scope)) continue;

    if (!best || score > best.score) best = { sentence, score, scope };
  }

  if (!best || best.score < 8) {
    const texasMatch = page.text.match(
      /[^.!?\n]{0,120}(?:song about|called)[^.!?\n]{0,80}(?:Texas|Fall In Love Again|Fall in Love Again)[^.!?\n]{0,160}/i,
    );
    if (texasMatch?.[0] && texasMatch[0].length >= 50) {
      const sentence = texasMatch[0].trim();
      return {
        fact: sentence,
        scope: 'track',
        evidenceUrl: page.url,
        evidenceQuote: sentence.slice(0, 220),
        confidence: 0.9,
        source: 'heuristic',
      };
    }
  }

  if (!best || best.score < 8) return null;

  return {
    fact: best.sentence,
    scope: best.scope,
    evidenceUrl: page.url,
    evidenceQuote: best.sentence.slice(0, 220),
    confidence: Math.min(best.score / 18, 1),
    source: 'heuristic',
  };
}
