import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAppAuth } from '../middleware/app-auth.js';
import { validateStoryFullBody } from '../middleware/validate-story.js';
import { safeErrorMessage } from '../middleware/security-headers.js';
import { enrichTrackMetadata } from '../services/musicbrainz.js';
import { fetchReferenceFacts } from '../services/wikipedia-facts.js';
import { generateStoryScript, hasGroqApiKey } from '../services/groq.js';
import { synthesizeSpeech, hasYandexCredentials } from '../services/yandex-tts.js';
import { resolveVoiceForStory } from '../services/voices.js';
import { signAudioAccess } from '../services/audio-token.js';
import { isUnlimitedInstall } from '../config/security.js';
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
  const unlimited = isUnlimitedInstall(installId);
  const quota = getDailyStoryQuota(installId);
  attachStoryQuotaHeaders(res, installId);
  res.json({
    tier: unlimited ? 'unlimited' : 'free',
    quota,
    hint: unlimited
      ? 'Без лимитов на этом устройстве.'
      : 'Свой Groq-ключ в приложении — без дневного лимита на сервере (Groq с телефона).',
  });
});

router.post('/full', validateStoryFullBody, async (req: Request, res: Response) => {
  if (!hasGroqApiKey()) {
    res.status(503).json({
      error: 'Story generation unavailable',
      code: 'GROQ_NOT_CONFIGURED',
      message: 'Groq не настроен на сервере. Добавь GROQ_API_KEY или свой ключ в настройках приложения.',
    });
    return;
  }

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
    const referenceFacts = await fetchReferenceFacts(
      metadata.artist,
      metadata.title,
      metadata.countryCode,
    );
    const voiceId = resolveVoiceForStory(ttsVoice, metadata.year, metadata.genre);

    const previousScripts = Array.isArray(previousScriptsRaw)
      ? previousScriptsRaw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];

    const story = await generateStoryScript({
      artist: metadata.artist,
      title: metadata.title,
      year: metadata.year,
      genre: metadata.genre,
      countryCode: metadata.countryCode,
      voiceId,
      storyLength,
      storyNarrator,
      previousScripts,
      referenceFacts,
    });

    const response: Record<string, unknown> = {
      artist: metadata.artist,
      title: metadata.title,
      year: metadata.year ?? null,
      genre: metadata.genre ?? null,
      country: metadata.countryCode ?? null,
      mbid: metadata.mbid ?? null,
      script: story.script,
      word_count: story.word_count,
      voiceId: story.voiceId,
      demo: false,
      quota: getDailyStoryQuota(req.installId ?? 'unknown'),
      sources: {
        musicbrainz: Boolean(metadata.year || metadata.genre || metadata.mbid),
        groq: true,
        yandexTts: hasYandexCredentials(),
      },
    };

    if (hasYandexCredentials()) {
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
      response.ttsHint = 'Нет Yandex TTS — телефон озвучит текст через системный Android TTS';
    }

    const installId = req.installId ?? 'unknown';
    attachStoryQuotaHeaders(res, installId);
    res.json(response);
  } catch (err) {
    console.error('POST /v1/story/full failed:', err);
    const rawMessage = err instanceof Error ? err.message : String(err);
    const isRateLimit = /429|rate_limit|tokens per day/i.test(rawMessage);
    const groqUnavailable = /groq|403 forbidden|could not produce a usable story/i.test(rawMessage);
    res.status(groqUnavailable ? 503 : 500).json({
      error: groqUnavailable ? 'Story generation unavailable' : 'Story generation failed',
      code: isRateLimit ? 'GROQ_RATE_LIMIT' : groqUnavailable ? 'GROQ_FAILED' : 'STORY_FAILED',
      message: isRateLimit
        ? 'Лимит Groq на сервере исчерпан. Если в настройках есть свой Groq-ключ — приложение попробует с телефона.'
        : groqUnavailable
          ? 'Groq не ответил. Добавь свой Groq-ключ в настройках или попробуй через минуту.'
          : safeErrorMessage(err),
    });
  }
});

export default router;
