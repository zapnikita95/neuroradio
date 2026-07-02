import type { StoryLanguageId } from './story-language.js';
import { resolveStoryNarrator, type StoryNarratorId } from './story-narrator.js';
import { appendPublicVoicedFact, resolveVoicedTextForStorage } from './public-voiced-facts.js';
import { enqueueSocialPublishCandidate } from './social-publish-queue.js';
import { anchorsReferenceFact, validateStoryScript } from './story-quality.js';
import { DEFAULT_STORY_LENGTH } from './story-length.js';
import { sendSocialCandidateToAdmin } from './telegram-admin-bot.js';
import { isTelegramAdminNotifyConfigured } from './telegram-admin-notify.js';

export interface PromoteVoicedFactInput {
  artist: string;
  title: string;
  voicedText: string;
  script?: string;
  seedFact?: string;
  storyNarrator?: string;
  lang?: StoryLanguageId;
  source: 'triple_like' | 'gold' | 'manual';
}

function passesPromoteQuality(
  voicedText: string,
  seedFact: string | undefined,
  artist: string,
  title: string,
  lang: StoryLanguageId,
): boolean {
  if (voicedText.trim().length < 20) return false;
  if (!seedFact?.trim()) {
    return voicedText.trim().split(/\s+/).length >= 45;
  }
  if (!anchorsReferenceFact(voicedText, [seedFact])) return false;
  const check = validateStoryScript(voicedText, DEFAULT_STORY_LENGTH, artist, title, {
    referenceFacts: [seedFact],
    storyLanguage: lang,
    skipPersonaCliches: true,
    strictLength: false,
  });
  return check.ok;
}

/** Promote voiced text to public store + social queue (quality-gated). */
export function promoteVoicedFactIfQuality(input: PromoteVoicedFactInput): boolean {
  const lang: StoryLanguageId = input.lang === 'en' ? 'en' : 'ru';
  const voicedText = resolveVoicedTextForStorage(input.voicedText, input.script ?? input.voicedText);
  if (!passesPromoteQuality(voicedText, input.seedFact, input.artist, input.title, lang)) {
    console.log(
      `[voiced-promote] skip quality "${input.artist}" — "${input.title}" source=${input.source}`,
    );
    return false;
  }

  const fact = appendPublicVoicedFact({
    artist: input.artist,
    title: input.title,
    voicedText,
    seedFact: input.seedFact,
    storyNarrator: input.storyNarrator,
    lang,
    source: input.source === 'gold' ? 'gold' : 'history',
    voicedAt: Date.now(),
  });
  if (!fact) return false;

  const narrator = resolveStoryNarrator(input.storyNarrator) as StoryNarratorId;
  const queued = enqueueSocialPublishCandidate({
    publicFactId: fact.id,
    artist: fact.artist,
    title: fact.title,
    voicedText: fact.voicedText,
    narrator,
    lang: fact.lang,
    source: input.source,
  });

  if (queued && isTelegramAdminNotifyConfigured()) {
    const preview = fact.voicedText.slice(0, 320);
    void sendSocialCandidateToAdmin(queued, preview);
  }

  return true;
}
