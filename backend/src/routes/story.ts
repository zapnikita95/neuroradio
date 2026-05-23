import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAppAuth } from '../middleware/app-auth.js';
import { validateStoryFullBody } from '../middleware/validate-story.js';
import { safeErrorMessage } from '../middleware/security-headers.js';
import { enrichTrackMetadata } from '../services/musicbrainz.js';
import { generateStoryScript, hasGroqApiKey } from '../services/groq.js';
import { synthesizeSpeech, hasYandexCredentials } from '../services/yandex-tts.js';
import { resolveVoiceForStory } from '../services/voices.js';
import { buildDemoStory, isDemoMode } from '../services/demo.js';
import { signAudioAccess } from '../services/audio-token.js';
import { attachStoryQuotaHeaders, getDailyStoryQuota } from '../middleware/rate-limit.js';
import type { StoryLengthId } from '../services/story-length.js';
import type { StoryNarratorId } from '../services/story-narrator.js';
import type { TtsVoiceSetting } from '../services/voices.js';
import type { TtsEmotion } from '../services/tts-options.js';

const router = Router();

router.use(requireAppAuth);

interface StoryFullBody {
  artist: string;
  title: string;
  previous_scripts?: string[];
  story_length?: StoryLengthId;
  story_narrator: StoryNarratorId;
  tts_voice: TtsVoiceSetting;
  tts_speed: number;
  tts_emotion: TtsEmotion;
}

router.get('/quota', (req: Request, res: Response) => {
  const installId = req.installId ?? 'unknown';
  const quota = getDailyStoryQuota(installId);
  attachStoryQuotaHeaders(res, installId);
  res.json({
    tier: 'free',
    quota,
    hint: 'Свой Groq-ключ в приложении — без дневного лимита на сервере (Groq с телефона).',
  });
});

router.post('/full', validateStoryFullBody, async (req: Request, res: Response) => {
  const {
    artist,
    title,
    previous_scripts: previousScriptsRaw,
    story_length: storyLength,
    story_narrator: storyNarrator,
    tts_voice: ttsVoice,
    tts_speed: ttsSpeed,
    tts_emotion: ttsEmotion,
  } = req.body as StoryFullBody;

  try {
    const metadata = await enrichTrackMetadata(artist, title);
    const voiceId = resolveVoiceForStory(ttsVoice, metadata.year, metadata.genre);
    const demo = isDemoMode();

    const previousScripts = Array.isArray(previousScriptsRaw)
      ? previousScriptsRaw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];

    let story;
    let usedDemoFallback = false;

    if (demo) {
      story = buildDemoStory(
        metadata.artist,
        metadata.title,
        metadata.year,
        metadata.genre,
        previousScripts,
        storyNarrator,
      );
    } else {
      try {
        story = await generateStoryScript({
          artist: metadata.artist,
          title: metadata.title,
          year: metadata.year,
          genre: metadata.genre,
          voiceId,
          storyLength,
          storyNarrator,
          previousScripts,
        });
      } catch (err) {
        console.error('Groq failed, using demo fallback:', err);
        story = buildDemoStory(
          metadata.artist,
          metadata.title,
          metadata.year,
          metadata.genre,
          previousScripts,
        );
        usedDemoFallback = true;
      }
    }

    const response: Record<string, unknown> = {
      artist: metadata.artist,
      title: metadata.title,
      year: metadata.year ?? null,
      genre: metadata.genre ?? null,
      mbid: metadata.mbid ?? null,
      script: story.script,
      word_count: story.word_count,
      voiceId: story.voiceId,
      demo: demo || usedDemoFallback,
      quota: getDailyStoryQuota(req.installId ?? 'unknown'),
      sources: {
        musicbrainz: Boolean(metadata.year || metadata.genre || metadata.mbid),
        groq: !demo && hasGroqApiKey(),
        yandexTts: !demo && hasYandexCredentials(),
      },
    };

    if (!demo && hasYandexCredentials()) {
      const id = uuidv4();
      const audio = await synthesizeSpeech(story.script, story.voiceId, `${id}.ogg`, {
        speed: ttsSpeed,
        emotion: ttsEmotion,
        artist: metadata.artist,
        title: metadata.title,
      });
      response.audioUrl = signAudioAccess(audio.fileName) ?? audio.audioUrl;
      response.audioFile = audio.fileName;
    } else {
      response.audioUrl = null;
      response.audioFile = null;
      response.ttsHint = hasYandexCredentials()
        ? null
        : 'Нет Yandex TTS — телефон озвучит текст через системный Android TTS';
    }

    const installId = req.installId ?? 'unknown';
    attachStoryQuotaHeaders(res, installId);
    res.json(response);
  } catch (err) {
    console.error('POST /v1/story/full failed:', err);
    res.status(500).json({
      error: 'Story generation failed',
      message: safeErrorMessage(err),
    });
  }
});

export default router;
