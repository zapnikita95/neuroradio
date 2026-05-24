import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAppAuth } from '../middleware/app-auth.js';
import { validateStoryFullBody } from '../middleware/validate-story.js';
import { safeErrorMessage } from '../middleware/security-headers.js';
import { enrichTrackMetadata } from '../services/musicbrainz.js';
import { fetchAggregatedFactBundle } from '../services/fact-aggregator.js';
import { pickReferenceFact } from '../services/fact-picker.js';
import {
  generateStoryScript as generateGroqStory,
  isGroqRateLimitError,
} from '../services/groq.js';
import { generateStoryScript as generateGeminiStory } from '../services/gemini.js';
import { hasGeminiApiKey } from '../services/gemini.js';
import { hasLlmKeyForProvider, resolveLlmProvider } from '../services/llm-provider.js';
import { setLogDetail } from '../middleware/request-logger.js';
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
  llm_provider?: string;
  gemini_model?: string;
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
  const llmProvider = resolveLlmProvider((req.body as StoryFullBody).llm_provider);
  if (!hasLlmKeyForProvider(llmProvider)) {
    res.status(503).json({
      error: 'Story generation unavailable',
      code: llmProvider === 'gemini' ? 'GEMINI_NOT_CONFIGURED' : 'GROQ_NOT_CONFIGURED',
      message: llmProvider === 'gemini'
        ? 'Gemini не настроен на сервере. Добавь GEMINI_API_KEY или свой ключ в настройках приложения.'
        : 'Groq не настроен на сервере. Добавь GROQ_API_KEY или свой ключ в настройках приложения.',
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
  const geminiModel = (req.body as StoryFullBody).gemini_model;
  const installId = req.installId ?? 'unknown';

  console.log(
    `[story] start install=${installId.slice(0, 8)} llm=${llmProvider} artist="${artist}" title="${title}"`,
  );

  try {
    const metadata = await enrichTrackMetadata(artist, title);
    const voiceId = resolveVoiceForStory(ttsVoice, metadata.year, metadata.genre);

    const previousScripts = Array.isArray(previousScriptsRaw)
      ? previousScriptsRaw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];

    const factBundle = await fetchAggregatedFactBundle(
      metadata.artist,
      metadata.title,
      metadata.countryCode,
      metadata.mbid,
      metadata.artistMbid,
    );
    const selectedFact = pickReferenceFact(factBundle, previousScripts);
    const referenceFacts = selectedFact
      ? [selectedFact.fact]
      : [...factBundle.trackFacts, ...factBundle.artistFacts].slice(0, 4);

    const storyInput = {
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
      selectedReferenceFact: selectedFact ?? undefined,
      ...(llmProvider === 'gemini' ? { geminiModel } : {}),
    };

    let story;
    let llmUsed = llmProvider;
    try {
      story = await (llmProvider === 'gemini' ? generateGeminiStory : generateGroqStory)(storyInput);
    } catch (genErr) {
      if (llmProvider === 'groq' && hasGeminiApiKey() && isGroqRateLimitError(genErr)) {
        console.warn(
          `[story] groq rate limited install=${installId.slice(0, 8)} — fallback to gemini artist="${artist}" title="${title}"`,
        );
        story = await generateGeminiStory({ ...storyInput, geminiModel });
        llmUsed = 'gemini';
      } else {
        throw genErr;
      }
    }

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
        groq: llmUsed === 'groq',
        gemini: llmUsed === 'gemini',
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
      response.ttsHint = 'Yandex TTS не настроен на сервере (YANDEX_API_KEY, YANDEX_FOLDER_ID)';
    }

    attachStoryQuotaHeaders(res, installId);
    console.log(
      `[story] ok install=${installId.slice(0, 8)} llm=${llmUsed} words=${story.word_count} audio=${Boolean(response.audioUrl)}`,
    );
    res.json(response);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[story] fail install=${installId.slice(0, 8)} llm=${llmProvider} artist="${artist}" title="${title}" err=${rawMessage.slice(0, 300)}`,
      err,
    );
    const isRateLimit = /\b429\b|rate_limit_exceeded/i.test(rawMessage);
    const isAuthError = /invalid_api_key|invalid api key|\b401\b.*invalid|\b403\b forbidden/i.test(rawMessage);
    const groqUnavailable = /groq api error|403 forbidden|groq http/i.test(rawMessage);
    const geminiUnavailable = /gemini api error|gemini http/i.test(rawMessage);
    const llmUnavailable = groqUnavailable || geminiUnavailable;
    const qualityRejected = /could not produce a usable story/i.test(rawMessage);
    const errorCode = isAuthError
        ? (llmProvider === 'gemini' ? 'GEMINI_INVALID_KEY' : 'GROQ_INVALID_KEY')
        : isRateLimit
          ? (llmProvider === 'gemini' ? 'GEMINI_RATE_LIMIT' : 'GROQ_RATE_LIMIT')
          : llmUnavailable
            ? (llmProvider === 'gemini' ? 'GEMINI_FAILED' : 'GROQ_FAILED')
            : qualityRejected
              ? 'STORY_QUALITY_REJECTED'
              : 'STORY_FAILED';
    const userMessage = isAuthError
        ? `${llmProvider === 'gemini' ? 'Gemini' : 'Groq'} API-ключ на сервере недействителен.`
        : isRateLimit
          ? `${llmProvider === 'gemini' ? 'Gemini' : 'Groq'}: лимит запросов — подожди минуту.`
          : llmUnavailable
            ? `${llmProvider === 'gemini' ? 'Gemini' : 'Groq'} не ответил — попробуй через минуту.`
            : qualityRejected
              ? 'Не получилось собрать историю — нажми «Рассказать историю» ещё раз.'
              : safeErrorMessage(err);
    setLogDetail(
      res,
      `code=${errorCode} llm=${llmProvider} ${rawMessage.slice(0, 200)}`,
    );
    res.status(llmUnavailable ? 503 : 500).json({
      error: llmUnavailable ? 'Story generation unavailable' : 'Story generation failed',
      code: errorCode,
      message: userMessage,
    });
  }
});

export default router;
