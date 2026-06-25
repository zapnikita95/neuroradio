import { FACT_HUNT_PROMPT_BLOCK } from './story-fact-hunt.js';
import { buildArtistScopeStoryPromptBlockEn } from './artist-bio-track-framing.js';
import { ENGLISH_LANGUAGE_PROMPT_BLOCK } from './story-english-language.js';
import {
  buildLengthStructurePlan,
  getStoryLengthPreset,
  StoryLengthId,
  type StoryLengthPreset,
} from './story-length.js';
import {
  buildPersonaForNarrator,
  getNarratorPreset,
  PERSONA_STYLE_DISCIPLINE,
  resolveStoryNarrator,
  StoryNarratorId,
} from './story-narrator.js';
import { buildStylePromptBlock } from './style-corpus.js';
import { eraContextForPrompt, resolveTrackLocale } from './track-locale.js';
import type { StoryPersona } from './prompts.js';
import { buildVoiceoverNamesEconomyPromptBlockEn } from './voiceover-no-names.js';
import { buildClosingPhrasePromptBlock } from './story-closing-phrases.js';

function buildLengthStructurePlanEn(length: StoryLengthPreset): string {
  switch (length.id) {
    case '30s':
      return `DURATION PLAN (30 sec — short, FAST delivery):
- HOOK → one dramatic scene from the fact → one-line ending.
- ${length.wordsMin}–${length.wordsMax} words max, ${length.sentenceHint}.
- User often picks fast speech — stay tight or audio gets cut.`;
    case '60s':
      return `DURATION PLAN (60 sec — MAIN mode, slightly brisk speech):
- Hook → behind-the-scenes drama from the fact → deeper meaning.
- ${length.wordsMin}–${length.wordsMax} words, ${length.sentenceHint}.
- One strong fact, no filler.`;
    default:
      return `DURATION PLAN (extended):
- Full story: hook → kitchen → meaning → final punch.
- ${length.wordsMin}–${length.wordsMax} words, ${length.sentenceHint}.`;
  }
}

const NARRATOR_LABELS_EN: Record<string, { label: string; description: string }> = {
  radio_host: { label: 'Radio host', description: 'Warm on-air tone — lively but factual' },
  contemporary: { label: 'Voice of the era', description: 'First-person nostalgia — you lived when the track dropped' },
  expert: { label: 'Genre expert', description: 'Podcast expertise — genre mechanics, not a lecture' },
  fan: { label: 'Superfan', description: 'Enthusiastic collector energy from the seed only' },
  backstage: { label: 'Backstage insider', description: 'Studio and label gossip tone' },
  night_dj: { label: 'Night DJ', description: 'Late-night smooth delivery' },
};

export function buildEnglishSystemPrompt(
  persona: StoryPersona,
  length: StoryLengthPreset,
  options: { artist?: string; title?: string } = {},
): string {
  const durationHint = length.targetSeconds
    ? `~${length.targetSeconds} seconds of speech`
    : 'extended story without a hard cap';

  const formatBlock = persona.formatRules
    ? persona.formatRules
    : 'Fact from seed → one vivid detail → short takeaway. No template openers.';

  const focusBlock = persona.contentFocus
    ? `FOCUS: ${persona.contentFocus}`
    : 'Contrast and interest through specifics from the seed, not filler';

  const lengthPlan = buildLengthStructurePlanEn(length);
  const narratorBlock = persona.narratorAddendum ? `\n${persona.narratorAddendum}\n` : '';
  const artist = options.artist?.trim() ?? '';
  const title = options.title?.trim() ?? '';
  const namesBlock = artist ? `\n${buildVoiceoverNamesEconomyPromptBlockEn(artist, title)}\n` : '';

  return `You write VOICEOVER text — a charismatic music storyteller who knows the industry inside out.

ROLE: ${persona.roleTitle}
ERA: ${persona.eraHint}
VOICE: ${persona.speechStyle}
${focusBlock}
${narratorBlock}
RECIPE (scale to duration):
- Fact + metaphor + punch line.
- Find DRAMA and CONTRAST: conflict, breakthrough, scandal, comeback — what people felt.
- Wikipedia seed = core. Do not invent people or events missing from the fact.
- FIRST SENTENCE REQUIRED: at least one concrete anchor from the seed (event/name/chart/platform).
- Artist name (max 2×), track title (max 1× in opener) WITHOUT quotes; then use they/this track/their album. Established terms OK (moonwalk, Billboard). Otherwise — REJECT, rewrite.
- If below minimum word count for the selected length — REJECT, expand with facts from the same seed.
${namesBlock}
${FACT_HUNT_PROMPT_BLOCK}

IMPORTANT ABOUT PERSONA:
- Persona affects ONLY tone, voice, rhythm and delivery.
- Persona must NOT change or replace factual content.
- If persona style conflicts with the seed — the seed wins.

${lengthPlan}

${PERSONA_STYLE_DISCIPLINE}

NEVER:
- "originally titled", band lineup lists, discography dumps.
- Ad/film/game lists.
- Generic studio fiction: "the team worked on the track".

LANGUAGE: English only. Keep artist names and track titles in original spelling.

${ENGLISH_LANGUAGE_PROMPT_BLOCK}

NUMBERS: no digits or years (except digits inside names/titles). Use "back then", "in those years".

FORMAT:
- ${formatBlock}
- Do not start with: "here's a fact", "interesting thing", "what happened is"

STRICT LENGTH: ${length.wordsMin}–${length.wordsMax} words (${durationHint}). ${length.sentenceHint}.
- word_count in JSON must stay in this range.

MARKUP: no + signs or [[phoneme]] tags in script.

FORBIDDEN: invented people, "Music Story", empty "magic of music", "legendary" without seed.
FORBIDDEN (filler): "few people know", "became a legend", "hall of fame", "touches hearts" without seed specifics.
FORBIDDEN: repeating the same critic quote verbatim ("Pitchfork nailed it", "Jill Mapes said") — paraphrase once or weave the fact into your own words.
FORBIDDEN: inventing cities, studios, vinyl collections, or live shows unless they are in the seed.

REQUIRED: the seed fact is recognizable (name, event, genre turn, scandal, gear); listener understands WHY it matters.

JSON: {"script":"...", "word_count": number, "voiceId": "rachel | adam | antoni | bella | elli | josh | sam | emily | charlie | matilda | auto"}`;
}

export function buildEnglishStoryUserPrompt(params: {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  countryCode?: string;
  voiceId: string;
  storyLength: StoryLengthId;
  storyNarrator?: StoryNarratorId;
  previousScripts?: string[];
  retryReason?: string;
  referenceFacts?: string[];
  selectedReferenceFact?: { fact: string; scope: 'artist' | 'track' | 'album'; scopeLabelRu: string };
  rawSnippets?: string[];
  artistTier?: 'major' | 'indie';
}): string {
  const narratorId = resolveStoryNarrator(params.storyNarrator);
  const locale = resolveTrackLocale({
    artist: params.artist,
    title: params.title,
    year: params.year,
    genre: params.genre,
    countryCode: params.countryCode,
  });
  const persona = buildPersonaForNarrator(
    narratorId,
    params.year,
    params.genre,
    params.artist,
    params.title,
    params.countryCode,
  );
  const length = getStoryLengthPreset(params.storyLength);
  const era = eraContextForPrompt(params.year, params.genre);

  const scopeLabelEn = (scope: string) => {
    if (scope === 'track') return 'track';
    if (scope === 'album') return 'album';
    return 'artist/band';
  };

  const lines: string[] = [
    `Artist: ${params.artist}`,
    `Track: ${params.title}`,
    '',
    buildVoiceoverNamesEconomyPromptBlockEn(params.artist, params.title),
  ];

  if (params.genre) lines.push(`Genre: ${params.genre}`);
  lines.push(`Country/scene: ${locale.countryLabelRu}`);
  lines.push(`Release year (for you only — NO digits in script): ${locale.yearLabelRu}`);
  lines.push(`Era context: ${era}`);

  if (params.artistTier === 'indie') {
    lines.push('');
    lines.push(
      'INDIE ARTIST — limited public data. Only facts from the list below. ' +
        'Do NOT invent labels, businesses, collabs, awards unless in the seed. ' +
        'You may honestly cover genre, year, country and the track.',
    );
  }

  lines.push(`Scene: ${locale.sceneHintRu}`);
  lines.push('');
  lines.push(`You are: ${persona.roleTitle}. Speak like: ${persona.speechStyle}`);
  if (narratorId !== 'auto') {
    const preset = getNarratorPreset(narratorId);
    const enLabels = NARRATOR_LABELS_EN[narratorId];
    if (preset && enLabels) {
      lines.push(`NARRATOR (PERSONA): ${enLabels.label} — ${enLabels.description}`);
      lines.push(preset.promptAddendum);
    }
  }
  lines.push('Persona = tone and format only. CONTENT comes strictly from the fact seed.');
  const styleBlock = buildStylePromptBlock({
    narratorId,
    lang: 'en',
    genre: params.genre,
    year: params.year,
    seedFact: params.selectedReferenceFact?.fact,
  });
  if (styleBlock) {
    lines.push('');
    lines.push(styleBlock);
  }
  lines.push(`STRICT LENGTH: ${length.wordsMin}–${length.wordsMax} words.`);
  lines.push(buildLengthStructurePlanEn(length));
  lines.push('In script — no digits or years except inside artist/title names.');
  lines.push(ENGLISH_LANGUAGE_PROMPT_BLOCK);

  const facts = params.referenceFacts?.filter(Boolean) ?? [];
  const selected = params.selectedReferenceFact;
  if (selected) {
    lines.push('');
    lines.push(`STORY FOCUS: fact about ${scopeLabelEn(selected.scope).toUpperCase()}.`);
    if (selected.scope === 'artist') {
      lines.push(buildArtistScopeStoryPromptBlockEn());
    }
    lines.push('STORY SEED (verified fact — this is the core):');
    lines.push(selected.fact);
    lines.push('DELIVERY RECIPE:');
    lines.push('1. HOOK — first line = contrast/paradox from the seed.');
    lines.push('2. BODY — one seed detail in spoken language.');
    lines.push('3. END — one short takeaway from the seed.');
    lines.push('FIRST line must contain an anchor from the seed.');
    lines.push(
      'If the seed cites a critic or review — paraphrase once in your own words. ' +
        'Never write "Pitchfork nailed it", "the review nailed it", or quote the critic verbatim.',
    );
  } else if (facts.length > 0) {
    lines.push('');
    lines.push(FACT_HUNT_PROMPT_BLOCK);
    lines.push('');
    lines.push('STORY SEEDS (pick ONE with maximum contrast):');
    facts.forEach((fact, i) => lines.push(`${i + 1}. ${fact}`));
  } else if ((params.rawSnippets?.length ?? 0) > 0) {
    lines.push('');
    lines.push(FACT_HUNT_PROMPT_BLOCK);
    lines.push('');
    lines.push('RAW SNIPPETS (Wikipedia, MusicBrainz, DuckDuckGo). In THIS response:');
    lines.push('1) pick ONE verifiable seed with contrast;');
    lines.push('2) write the story strictly from that seed.');
    params.rawSnippets!.slice(0, 14).forEach((s, i) => {
      const trimmed = s.length > 420 ? `${s.slice(0, 420)}…` : s;
      lines.push(`${i}. ${trimmed}`);
    });
  }

  if (params.retryReason) {
    lines.push('');
    lines.push(`PREVIOUS ANSWER REJECTED: ${params.retryReason}`);
    lines.push('Rewrite completely: different scene, no digits, English only, no meta openers.');
  }

  const prev = params.previousScripts?.filter(Boolean) ?? [];
  if (prev.length > 0) {
    lines.push('');
    lines.push('ALREADY TOLD — different fact, different scene:');
    prev.slice(0, 5).forEach((s, i) => {
      const snippet = s.length > 200 ? `${s.slice(0, 200)}…` : s;
      lines.push(`${i + 1}. ${snippet}`);
    });
  }

  lines.push('');
  lines.push(buildClosingPhrasePromptBlock(narratorId, params.artist, params.title, prev, 'en'));
  lines.push(`Voice (voiceId): ${params.voiceId}`);
  lines.push('Reply in JSON.');
  return lines.join('\n');
}
