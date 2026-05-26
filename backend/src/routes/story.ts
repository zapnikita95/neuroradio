import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAppAuth } from '../middleware/app-auth.js';
import { validateStoryFullBody } from '../middleware/validate-story.js';
import { enrichTrackMetadata } from '../services/musicbrainz.js';
import { fetchAggregatedFactBundle } from '../services/fact-aggregator.js';
import { explainReferenceFactSelection, pickReferenceFact } from '../services/fact-picker.js';
import { hasLlmKeyForProvider, resolveLlmProvider } from '../services/llm-provider.js';
import { generateStoryWithFallback } from '../services/story-llm-router.js';
import { setLogDetail } from '../middleware/request-logger.js';
import { synthesizeSpeech, hasYandexCredentials } from '../services/yandex-tts.js';
import { coerceVoiceForSpeechKit, resolveVoiceForStory } from '../services/voices.js';
import { signAudioAccess } from '../services/audio-token.js';
import { isUnlimitedInstall } from '../config/security.js';
import { attachStoryQuotaHeaders, getDailyStoryQuota, recordStoryGeneration } from '../middleware/rate-limit.js';
import { classifyStoryLlmError } from '../services/llm-error-message.js';
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
    `[story] start install=${installId.slice(0, 8)} llm=${llmProvider}` +
      (llmProvider === 'gemini' ? ` model=${geminiModel ?? 'default'}` : '') +
      ` artist="${artist}" title="${title}"`,
  );

  try {
    const metadata = await enrichTrackMetadata(artist, title);
    const voiceId = coerceVoiceForSpeechKit(
      resolveVoiceForStory(ttsVoice, metadata.year, metadata.genre),
    );

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
    const trackFactCount = factBundle.trackFacts.length;
    const artistFactCount = factBundle.artistFacts.length;
    console.log(
      `[facts] ${metadata.artist} — ${metadata.title}: track=${trackFactCount} artist=${artistFactCount}`,
    );
    const selectedFact = pickReferenceFact(
      factBundle,
      previousScripts,
      previousScripts.length,
      metadata.artist,
      metadata.title,
    );
    const selectedFactWhy = explainReferenceFactSelection(factBundle, selectedFact);
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

    const { story, llmUsed } = await generateStoryWithFallback(storyInput, llmProvider);

    // Copy-friendly Railway logs: seed + final script with clear block markers.
    if (selectedFact?.fact) {
      console.log(
        `[story-seed] ${metadata.artist} — ${metadata.title} | scope=${selectedFact.scope} | ${selectedFact.fact}`,
      );
      console.log(`[story-seed-why] ${selectedFactWhy}`);
    }
    console.log(
      `[story-script] ${metadata.artist} — ${metadata.title} | llm=${llmUsed} | narrator=${storyNarrator} | words=${story.word_count}`,
    );
    console.log('[story-script-begin]');
    console.log(story.script);
    console.log('[story-script-end]');

    const response: Record<string, unknown> = {
      artist: metadata.artist,
      title: metadata.title,
      year: metadata.year ?? null,
      genre: metadata.genre ?? null,
      country: metadata.countryCode ?? null,
      mbid: metadata.mbid ?? null,
      script: story.script,
      word_count: story.word_count,
      voiceId,
      demo: false,
      quota: getDailyStoryQuota(req.installId ?? 'unknown'),
      sources: {
        wikipedia: trackFactCount + artistFactCount > 0,
        factCountTrack: trackFactCount,
        factCountArtist: artistFactCount,
        referenceFactPicked: Boolean(selectedFact),
        musicbrainz: Boolean(metadata.year || metadata.genre || metadata.mbid),
        groq: llmUsed === 'groq',
        gemini: llmUsed === 'gemini',
        yandexTts: hasYandexCredentials(),
      },
    };

    if (hasYandexCredentials()) {
      const id = uuidv4();
      console.log(
        `[yandex-tts] queue${installId.slice(0, 8)} voice=${voiceId} speed=${ttsSpeed} emotion=${ttsEmotion} words=${story.word_count}`,
      );
      const audio = await synthesizeSpeech(story.script, voiceId, `${id}.ogg`, {
        speed: ttsSpeed,
        emotion: ttsEmotion,
        artist: metadata.artist,
        title: metadata.title,
        logContext: {
          installId,
          artist: metadata.artist,
          title: metadata.title,
        },
      });
      response.audioUrl = signAudioAccess(audio.fileName) ?? audio.audioUrl;
      response.audioFile = audio.fileName;
    } else {
      response.audioUrl = null;
      response.audioFile = null;
      response.ttsHint = 'Yandex TTS не настроен на сервере (YANDEX_API_KEY, YANDEX_FOLDER_ID)';
    }

    recordStoryGeneration(installId, req);
    attachStoryQuotaHeaders(res, installId);
    console.log(
      `[story] ok install=${installId.slice(0, 8)} llm=${llmUsed} words=${story.word_count} audio=${Boolean(response.audioUrl)}`,
    );
    res.json(response);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const isTts = /yandex tts|speechkit|tts\.api\.cloud\.yandex/i.test(rawMessage);
    if (isTts) {
      console.error(
        `[yandex-tts] story-fail install=${installId.slice(0, 8)} artist="${artist}" title="${title}" speed=${(req.body as StoryFullBody).tts_speed} emotion=${(req.body as StoryFullBody).tts_emotion} err=${rawMessage.slice(0, 280)}`,
      );
    } else {
      console.error(
        `[story] fail install=${installId.slice(0, 8)} llm=${llmProvider} artist="${artist}" title="${title}" err=${rawMessage.slice(0, 300)}`,
      );
    }
    const { code: errorCode, message: userMessage, httpStatus } = classifyStoryLlmError(err, llmProvider);
    setLogDetail(
      res,
      `code=${errorCode} ${isTts ? 'yandex-tts' : `llm=${llmProvider}`} ${rawMessage.slice(0, 200)}`,
    );
    res.status(httpStatus).json({
      error: httpStatus === 503 ? 'Story generation unavailable' : 'Story generation failed',
      code: errorCode,
      message: userMessage,
      source: isTts ? 'tts' : 'llm',
    });
  }
});

export default router;
