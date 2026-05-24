import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAppAuth } from '../middleware/app-auth.js';
import { validateStoryFullBody } from '../middleware/validate-story.js';
import { safeErrorMessage } from '../middleware/security-headers.js';
import { enrichTrackMetadata } from '../services/musicbrainz.js';
import { fetchAggregatedFactBundle } from '../services/fact-aggregator.js';
import { pickReferenceFact } from '../services/fact-picker.js';
import { generateStoryScript as generateGroqStory } from '../services/groq.js';
import { generateStoryScript as generateGeminiStory } from '../services/gemini.js';
import { hasLlmKeyForProvider, resolveLlmProvider } from '../services/llm-provider.js';
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

    const story = await (llmProvider === 'gemini' ? generateGeminiStory : generateGroqStory)({
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
        groq: llmProvider === 'groq',
        gemini: llmProvider === 'gemini',
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

    attachStoryQuotaHeaders(res, installId);
    console.log(
      `[story] ok install=${installId.slice(0, 8)} llm=${llmProvider} words=${story.word_count} audio=${Boolean(response.audioUrl)}`,
    );
    res.json(response);
  } catch (err) {
    console.error(
      `[story] fail install=${installId.slice(0, 8)} llm=${llmProvider} artist="${artist}" title="${title}":`,
      err,
    );
    const rawMessage = err instanceof Error ? err.message : String(err);
    const isRateLimit = /\b429\b|rate_limit_exceeded/i.test(rawMessage);
    const isAuthError = /invalid_api_key|invalid api key|\b401\b.*invalid|\b403\b forbidden/i.test(rawMessage);
    const groqUnavailable = /groq api error|403 forbidden|groq http/i.test(rawMessage);
    const geminiUnavailable = /gemini api error|gemini http/i.test(rawMessage);
    const llmUnavailable = groqUnavailable || geminiUnavailable;
    const qualityRejected = /could not produce a usable story/i.test(rawMessage);
    res.status(llmUnavailable ? 503 : 500).json({
      error: llmUnavailable ? 'Story generation unavailable' : 'Story generation failed',
      code: isAuthError
        ? (llmProvider === 'gemini' ? 'GEMINI_INVALID_KEY' : 'GROQ_INVALID_KEY')
        : isRateLimit
          ? (llmProvider === 'gemini' ? 'GEMINI_RATE_LIMIT' : 'GROQ_RATE_LIMIT')
          : llmUnavailable
            ? (llmProvider === 'gemini' ? 'GEMINI_FAILED' : 'GROQ_FAILED')
            : qualityRejected
              ? 'STORY_QUALITY_REJECTED'
              : 'STORY_FAILED',
      message: isAuthError
        ? `${llmProvider === 'gemini' ? 'Gemini' : 'Groq'} API-ключ на сервере недействителен. Добавь свой ключ в приложении — он обходит сервер.`
        : isRateLimit
          ? `Лимит ${llmProvider === 'gemini' ? 'Gemini' : 'Groq'} на сервере исчерпан. Свой ключ в настройках приложения обходит этот лимит.`
          : llmUnavailable
            ? `${llmProvider === 'gemini' ? 'Gemini' : 'Groq'} не ответил. Добавь свой ключ в настройках или попробуй через минуту.`
            : qualityRejected
              ? 'Не получилось собрать историю — нажми «Рассказать историю» ещё раз.'
              : safeErrorMessage(err),
    });
  }
});

export default router;
