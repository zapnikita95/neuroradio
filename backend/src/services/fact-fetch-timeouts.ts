/**
 * Единые таймауты сбора фактов.
 * Внешний fetchWithCap должен быть >= внутренних AbortSignal в каждом источнике.
 */
export const FACT_FETCH_BUDGET_MS = parseInt(process.env.FACT_FETCH_TIMEOUT_MS ?? '14000', 10);

/** Default per-source wall cap in parallel harvest (Promise.all waits for slowest). */
export const FACT_SOURCE_CAP_MS = parseInt(process.env.FACT_SOURCE_CAP_MS ?? '9000', 10);

export const FACT_WIKI_CAP_MS = parseInt(process.env.FACT_WIKI_CAP_MS ?? String(FACT_SOURCE_CAP_MS), 10);
export const FACT_WIKI_FAST_CAP_MS = parseInt(
  process.env.FACT_WIKI_FAST_CAP_MS ?? String(FACT_SOURCE_CAP_MS),
  10,
);
export const FACT_WEB_CAP_MS = parseInt(process.env.FACT_WEB_CAP_MS ?? String(FACT_SOURCE_CAP_MS), 10);
export const FACT_DEDICATED_CAP_MS = parseInt(
  process.env.FACT_DEDICATED_CAP_MS ?? String(FACT_SOURCE_CAP_MS + 2000),
  10,
);
export const FACT_DDG_CAP_MS = parseInt(process.env.FACT_DDG_CAP_MS ?? String(FACT_SOURCE_CAP_MS), 10);
export const FACT_WIKIDATA_CAP_MS = parseInt(
  process.env.FACT_WIKIDATA_CAP_MS ?? String(FACT_SOURCE_CAP_MS),
  10,
);
export const FACT_MB_CAP_MS = parseInt(process.env.FACT_MB_CAP_MS ?? String(FACT_SOURCE_CAP_MS), 10);
export const FACT_WIKI_LEAD_CAP_MS = parseInt(
  process.env.FACT_WIKI_LEAD_CAP_MS ?? String(FACT_SOURCE_CAP_MS),
  10,
);

/** Dedicated parsers run up to SOURCE_TIMEOUT_MS each — outer cap must cover that. */
export const FACT_DEDICATED_SOURCE_TIMEOUT_MS = parseInt(
  process.env.FACT_DEDICATED_SOURCE_TIMEOUT_MS ?? '8000',
  10,
);
