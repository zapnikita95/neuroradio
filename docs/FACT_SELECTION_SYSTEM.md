# Fact Selection System (Seed Logic)

This document records the exact decision system used to pick the final seed fact for story generation.
It is intended to be auditable end-to-end: from raw fact bundle to final selected fact.

## 1) Goal

Pick one factual seed that is:

- real and verifiable,
- non-repetitive vs previous stories,
- strong enough to produce an interesting narrative,
- biased toward human/soulful backstory when available.

## 2) Inputs

- `trackFacts`: facts anchored to the track page/query.
- `artistFacts`: facts anchored to the artist page/query.
- `previousScripts`: already generated stories for the same track key.
- `storyIndex`: index of the current story for alternation logic.

## 3) Preprocessing

1. Trim and dedupe facts (`normalize -> distinct`).
2. Drop too-short candidates (`< 35 chars` in quality filtering).
3. Rank candidates by `interestScore`.
4. Remove boring patterns (`isBoringFact`), such as:
   - "is a song by", lineup/discography boilerplate,
   - "formed in", "first single", generic soundtrack placements.

## 4) Scoring model (`interestScore`)

Positive signals:

- strong story/contrast/conflict patterns,
- high-impact language (breakthrough, scandal, paradox, protest),
- backstory patterns (family, divorce, apology, interview context),
- collector-only patterns (streams/charts/release anomalies), when relevant.

Negative signals:

- encyclopedia boilerplate,
- weak trivia and generic chart-only blurbs,
- media list spam (ads/films/games without narrative value).

## 5) Selection order

Let `preferTrack = storyIndex % 2 == 0`.

Pools:

- `primary = trackFacts` if `preferTrack`, otherwise `artistFacts`
- `fallback = artistFacts` if `preferTrack`, otherwise `trackFacts`

Selection sequence:

1. Pick non-repetitive **backstory** fact from `primary`.
2. Pick non-repetitive **backstory** fact from `fallback`.
3. Pick non-repetitive high-score fact from `primary`.
4. Pick non-repetitive high-score fact from `fallback`.
5. Last resort: any non-boring non-repetitive fact from combined pools.

## 6) Repetition guard

For each candidate fact:

1. Build significant tokens (`length >= 5`, normalized).
2. Compare against significant tokens from each previous script.
3. If overlap hits threshold (`2..3` dynamic), treat as already covered and skip.

## 7) Why this fixes "chart garbage"

- Backstory-first priority outranks dry metric-only trivia.
- Chart/stream facts are no longer auto-top unless they carry real narrative signal.
- Ungrounded drama is filtered later by quality gates (anti-fiction, anchor checks).

## 8) Runtime observability (Railway logs)

On successful story generation, backend logs:

- `[story-seed] ...` selected seed and scope
- `[story-seed-why] ...` compact explanation (`scope`, `interestScore`, `backstory=true/false`)
- `[story-script-begin] ... [story-script-end]` final text block

This makes fact choice and output auditable from logs without local debugging.
