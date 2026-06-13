import { interestScore } from './reference-fact-quality.js';
import type { SelectedReferenceFact } from './fact-picker.js';
import type { ReferenceFactBundle } from './fact-picker.js';
import { splitBundleByScope } from './fact-ranking.js';

/** 1–10 для логов и UI — из interestScore без хардкода треков. */
export function interestRating10(fact: string): number {
  const raw = interestScore(fact);
  if (raw >= 28) return 10;
  if (raw >= 22) return 9;
  if (raw >= 18) return 8;
  if (raw >= 14) return 7;
  if (raw >= 10) return 6;
  if (raw >= 7) return 5;
  if (raw >= 4) return 4;
  return Math.max(1, Math.min(3, Math.round(raw / 2)));
}

export type FactSeedSource =
  | 'curated'
  | 'bank'
  | 'online-pick'
  | 'llm-hunt'
  | 'web-salvage'
  | 'wiki-fallback'
  | 'none';

const FACT_ORIGIN_LABELS: Record<FactSeedSource, string> = {
  curated: 'ЗАГОТОВКА curated-facts.json',
  bank: 'БАНК facts-bank (volume, ранее сохранён)',
  'online-pick': 'ОНЛАЙН picker (свежий fetch wiki/lastfm/genius)',
  'llm-hunt': 'LLM-HUNT (нейросеть из сниппетов)',
  'web-salvage': 'SALVAGE (HTML-обрезок при timeout wiki)',
  'wiki-fallback': 'WIKI-FALLBACK (биография/лид)',
  none: 'NONE',
};

export function formatFactPickLog(
  selected: SelectedReferenceFact | null,
  source: FactSeedSource | 'rules' | 'llm' | 'metadata' | 'bank' | 'none',
  detail?: string,
): string {
  const normalized: FactSeedSource =
    source === 'rules'
      ? detail?.includes('salvage')
        ? 'web-salvage'
        : 'online-pick'
      : source === 'llm'
        ? 'llm-hunt'
        : source === 'metadata'
          ? 'wiki-fallback'
          : (source as FactSeedSource);
  if (!selected) {
    return `[facts] seed=NONE ORIGIN=${normalized} (${FACT_ORIGIN_LABELS[normalized]}) interestScore=0 interest=0/10`;
  }
  const score = interestScore(selected.fact);
  const rating = interestRating10(selected.fact);
  const preview = selected.fact.replace(/\s+/g, ' ').slice(0, 120);
  const detailSuffix = detail && !detail.includes('salvage') ? ` detail=${detail}` : '';
  return (
    `[facts] seed ORIGIN=${normalized} (${FACT_ORIGIN_LABELS[normalized]})` +
    `${detailSuffix} scope=${selected.scope} ` +
    `interestScore=${score} interest=${rating}/10 ` +
    `fact="${preview}${selected.fact.length > 120 ? '…' : ''}"`
  );
}

/** Log ranked fact pools so Railway logs show score/interest for every candidate, not only the pick. */
export function logFactCandidatePools(
  bundle: ReferenceFactBundle,
  artist: string,
  title: string,
): void {
  const pools = splitBundleByScope(bundle, artist, title);
  for (const scope of ['track', 'album', 'artist'] as const) {
    const facts = pools[scope];
    if (facts.length === 0) {
      console.log(`[facts] pool scope=${scope} count=0`);
      continue;
    }
    console.log(`[facts] pool scope=${scope} count=${facts.length}:`);
    for (let i = 0; i < Math.min(6, facts.length); i++) {
      const fact = facts[i]!;
      const score = interestScore(fact);
      const rating = interestRating10(fact);
      const preview = fact.replace(/\s+/g, ' ').slice(0, 85);
      console.log(
        `[facts]   ${i + 1}. score=${score} interest=${rating}/10 ` +
          `"${preview}${fact.length > 85 ? '…' : ''}"`,
      );
    }
  }
}
