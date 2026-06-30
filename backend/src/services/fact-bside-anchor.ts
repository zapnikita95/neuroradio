import { factMentionsTitle } from './fact-relevance.js';

/**
 * Wiki snippets like «It was used as the B-side to the single release of "Radio Ga Ga"»
 * describe another song on the flip — not that the requested track was a B-side.
 * LLM often flips this into «Radio Ga Ga вышла би-сайдом».
 */
export function isMisanchoredBSideSeed(fact: string, title: string): boolean {
  if (!title.trim() || !fact.trim()) return false;
  if (!/\b(?:b[- ]?side|bi[- ]?side)\b/i.test(fact)) return false;
  if (!factMentionsTitle(fact, title)) return false;

  const bSideToSingleOfTrack =
    /\b(?:b[- ]?side|bi[- ]?side)\s+to\s+(?:the\s+)?(?:single\s+)?(?:release\s+)?of\b/i.test(fact) ||
    /\b(?:b[- ]?side|bi[- ]?side)\s+to\s+(?:the\s+)?single\b/i.test(fact);

  if (bSideToSingleOfTrack) return true;

  const usedAsBSideTo =
    /\b(?:was|is|were|it\s+was|instead\s+used\s+as)\s+(?:the\s+)?(?:b[- ]?side|bi[- ]?side)\s+to\b/i.test(
      fact,
    );
  if (usedAsBSideTo) return true;

  return false;
}

/** Seed says another song was B-side to this track's single, but script claims this track was the B-side. */
export function findSeedBSideRoleFlip(
  script: string,
  referenceFacts: string[],
  title: string,
): string | null {
  if (!title.trim() || referenceFacts.length === 0) return null;
  const seed = referenceFacts.join(' ');
  if (!isMisanchoredBSideSeed(seed, title)) return null;

  const trackWasBSideRu =
    /(?:вышл\w*|выход\w*|выпуст\w*|выш\w*|была|был\w*|оказал\w*)\s+(?:как\s+)?(?:би[- ]?сайд|б[-]?сайд|сторон\w*\s+бэ)/i.test(
      script,
    ) ||
    /(?:би[- ]?сайд|б[-]?сайд|сторон\w*\s+бэ)\s+(?:к\s+)?(?:сингл\w*|single)/i.test(script) ||
    /(?:изначально|сначала)\s+(?:вышл\w*|была|был\w*)\s+(?:как\s+)?(?:би[- ]?сайд|б[-]?сайд)/i.test(
      script,
    );

  const trackWasBSideEn =
    /\b(?:was|were|originally)\s+(?:released\s+)?as\s+(?:the\s+)?(?:a\s+)?b[- ]?side\b/i.test(
      script,
    );

  if (trackWasBSideRu || trackWasBSideEn) {
    return 'B-side role flip: seed describes flip-side of this single, not this track as B-side';
  }
  return null;
}
