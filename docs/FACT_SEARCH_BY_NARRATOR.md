# Fact Search Playbook By Narrator

This document is a practical spec for how Music Story must search, select, and narrate facts for each narrator (`амплуа`).
Use it as a verification checklist against generated stories.

## 1) Global Pipeline (for any narrator)

1. Resolve track metadata (`artist`, `title`, locale, year/genre when available).
2. Build fact bundle:
   - Track page candidates first (`<title> (<artist> song)` etc.).
   - Then search fallback.
   - Separate `trackFacts` and `artistFacts`.
3. Filter wrong-topic pages:
   - Reject religion/novel/literature pages when artist/track anchors are missing.
4. Rank facts:
   - Prefer contrast, conflict, breakthrough, release anomalies.
   - For collector mode: prioritize TikTok/streams/charts/co-writer/release details.
5. Pick one seed fact (`selectedReferenceFact`), avoid repetition vs previous scripts.
6. Build narrator persona prompt + hard bans.
7. Validate output:
   - Russian-only rules.
   - Anti-template patterns.
   - Anchor to selected seed (especially first lines).

## 2) Hard Rules For Seed Facts

- Seed must be verifiable and specific.
- Seed should contain at least one hard anchor:
  - name/event/platform/metric/time-shift/controversy/co-writer/chart milestone.
- Never use as seed:
  - generic biography, lineup, "is a song by", "formed in", empty "fans love it".
- Never invent:
  - fake studio drama, fake bans, fake politics, fake literary meaning.

## 3) Narrator Matrix

### 3.1 `radio_host` (Радиоведущий)

**Goal**
- Immediate hook for broad audience.

**Best seed types**
- Breakthrough event, delayed explosion, surprising milestone.

**Search emphasis**
- Track page first, then artist page context.
- Keep one vivid, high-signal fact.

**Forbidden style**
- "мало кто знает", "легендарная", "трогает сердца", encyclopedic intro.

**Pass criteria**
- First phrase already contains concrete seed detail.

### 3.2 `contemporary` (Современник эпохи)

**Goal**
- Make fact feel lived-in historically, without fabrication.

**Best seed types**
- Era-linked context, social/music-scene contrast, release-time impact.

**Search emphasis**
- Locale/year context from metadata + factual anchor from seed.

**Forbidden style**
- Fake eyewitness details not present in fact source.

**Pass criteria**
- One era texture + one concrete factual anchor.

### 3.3 `expert` (Эксперт жанра)

**Goal**
- Explain why track mattered technically/culturally.

**Best seed types**
- Genre shift, production decision, sample, conflict, prohibition, paradox.

**Search emphasis**
- High-information facts; mechanism over emotional filler.

**Forbidden style**
- Watered "expertise" without mechanism.

**Pass criteria**
- Explains "why" using factual mechanism from seed.

### 3.4 `fan` (Фанат-коллекционер)

**Goal**
- Insider release intelligence for collectors.

**Best seed types**
- TikTok resurgence, streams (million/billion), Hot 100/Global 200, co-writer,
  release oddities, remix effects, limited/bootleg context.

**Search emphasis**
- Collector patterns get priority in ranking.
- Track anchors can be: artist mention OR track mention OR collector fact marker.

**Hard bans**
- "фанаты спорят почему популярна", "на моей полке", literature/religion metaphors,
  gothic/XIX century narratives unless explicitly in source.

**Pass criteria**
- First sentence includes hard collector detail (metric/platform/chart/release anomaly).

### 3.5 `backstage` (С закулисья)

**Goal**
- Tell a real behind-the-scenes incident.

**Best seed types**
- Documented conflict, refusal, production incident, decision under pressure.

**Search emphasis**
- Only if fact source really contains the incident.

**Hard bans**
- Fabricated studio drama.

**Pass criteria**
- "Backstage" claim maps to explicit source detail.

### 3.6 `night_dj` (Ночной диджей)

**Goal**
- Low-energy, intimate delivery with factual anchor.

**Best seed types**
- Quiet but striking fact, delayed recognition, late-night relevance.

**Search emphasis**
- Same seed quality as others; tone is softer, facts still hard.

**Hard bans**
- Empty lyrical mood without factual core.

**Pass criteria**
- Fact appears in first two sentences, then mood.

## 4) Track-Specific Validation Example: Tame Impala — Dracula

Acceptable seed directions:
- first top-10 US Hot 100 milestone (remix context),
- delayed/viral mechanics if sourced,
- co-writer detail (Sarah Aarons),
- release context tied to actual track/article facts.

Reject as hallucination:
- political bans, religious framing, literary Dracula narrative,
- unspecified "double sessions", "hundreds of takes", fake producer conflicts.

## 5) Operational QA Checklist

Before accepting output:

1. Is the seed from a music-relevant source page?
2. Does the first sentence contain concrete seed anchor?
3. Does narrator style match selected narrator?
4. Are banned generic/hallucination patterns absent?
5. Is there drift into non-music topics?
6. Is this materially different from previous scripts?

If any answer is "no" -> regenerate with stricter anchor.
