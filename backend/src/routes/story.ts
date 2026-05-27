import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAppAuth } from '../middleware/app-auth.js';
import { validateStoryFullBody } from '../middleware/validate-story.js';
import { enrichTrackMetadata } from '../services/musicbrainz.js';
import { fetchAggregatedFactContext } from '../services/fact-aggregator.js';
import { explainReferenceFactSelection, pickReferenceFact } from '../services/fact-picker.js';
import {
  explainLlmFactSelection,
  huntReferenceFactWithLlm,
  shouldRunLlmFactHunt,
} from '../services/story-llm-fact-hunt.js';
import { hasLlmKeyForProvider, resolveLlmProvider } from '../services/llm-provider.js';
import { generateStoryWithFallback } from '../services/story-llm-router.js';
import { setLogDetail } from '../middleware/request-logger.js';
import { hasYandexCredentials } from '../services/yandex-tts.js';
import { coerceVoiceForSpeechKit } from '../services/voices.js';
import { resolveVoiceDelivery } from '../services/tts-voice-profiles.js';
import type { TtsVoiceStyleId } from '../services/tts-voice-profiles.js';
import {
  PremiumTtsAccessError,
  synthesizeStoryAudio,
  type TtsProviderId,
  type VoiceTier,
} from '../services/tts-router.js';
import {
  hasPremiumEntitlement,
  premiumUpsellHintRu,
  resolveUserTier,
} from '../services/entitlements.js';
import { isAzureSpeechEnabled } from '../services/entitlements.js';
import { canUseAzureSpeechProduction, hasAzureSpeechCredentials } from '../services/tts-router.js';
import { signAudioAccess } from '../services/audio-token.js';
import { attachStoryQuotaHeaders, getDailyStoryQuota, recordStoryGeneration } from '../middleware/rate-limit.js';
import { classifyStoryLlmError } from '../services/llm-error-message.js';
import { isNoReferenceFactsError, NoReferenceFactsError } from '../services/story-errors.js';
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
  tts_style: TtsVoiceStyleId;
  voice_tier: VoiceTier;
  tts_provider: TtsProviderId;
  llm_provider?: string;
  gemini_model?: string;
}

router.get('/quota', (req: Request, res: Response) => {
  const installId = req.installId ?? 'unknown';
  const tier = resolveUserTier(installId);
  const quota = getDailyStoryQuota(installId);
  attachStoryQuotaHeaders(res, installId);
  res.json({
    tier,
    premium: hasPremiumEntitlement(installId),
    quota,
    hint:
      tier === 'unlimited'
        ? 'Без лимитов на этом устройстве.'
        : tier === 'premium'
          ? premiumUpsellHintRu(tier)
          : `${premiumUpsellHintRu(tier)} Свой Groq-ключ в приложении — без дневного лимита на сервере (Groq с телефона).`,
    premiumTtsReady: canUseAzureSpeechProduction(),
    azureSpeech: hasAzureSpeechCredentials() && isAzureSpeechEnabled(),
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
    tts_style: ttsStyle,
    voice_tier: voiceTier,
    tts_provider: ttsProvider,
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
    const delivery = resolveVoiceDelivery({
      ttsVoice,
      ttsStyle,
      storyNarrator,
      year: metadata.year,
      genre: metadata.genre,
      clientSpeed: ttsSpeed,
      clientEmotion: ttsEmotion,
      clientVoiceLocked: ttsVoice !== 'auto',
    });
    const voiceId = coerceVoiceForSpeechKit(delivery.voiceId);

    const previousScripts = Array.isArray(previousScriptsRaw)
      ? previousScriptsRaw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];

    let factCtx = await fetchAggregatedFactContext(
      metadata.artist,
      metadata.title,
      metadata.countryCode,
      metadata.mbid,
      metadata.artistMbid,
    );
    let factBundle = factCtx.bundle;
    let trackFactCount = factBundle.trackFacts.length;
    let artistFactCount = factBundle.artistFacts.length;
    if (trackFactCount + artistFactCount === 0) {
      console.warn(`[facts] empty bundle for "${metadata.artist}" — "${metadata.title}", retrying sources`);
      await new Promise((r) => setTimeout(r, 700));
      factCtx = await fetchAggregatedFactContext(
        metadata.artist,
        metadata.title,
        metadata.countryCode,
        metadata.mbid,
        metadata.artistMbid,
      );
      factBundle = factCtx.bundle;
      trackFactCount = factBundle.trackFacts.length;
      artistFactCount = factBundle.artistFacts.length;
    }
    console.log(
      `[facts] ${metadata.artist} — ${metadata.title}: track=${trackFactCount} artist=${artistFactCount} rawSnippets=${factCtx.rawSnippets.length}`,
    );

    let selectedFact = pickReferenceFact(
      factBundle,
      previousScripts,
      previousScripts.length,
      metadata.artist,
      metadata.title,
    );
    let factHuntLlm = false;
    const bundleFactCount = trackFactCount + artistFactCount;

    if (shouldRunLlmFactHunt(selectedFact, factCtx.rawSnippets.length, bundleFactCount)) {
      console.log(
        `[fact-hunt-llm] start artist="${metadata.artist}" title="${metadata.title}" snippets=${factCtx.rawSnippets.length}`,
      );
      const hunted = await huntReferenceFactWithLlm({
        artist: metadata.artist,
        title: metadata.title,
        year: metadata.year,
        genre: metadata.genre,
        rawSnippets: factCtx.rawSnippets,
        preferredProvider: llmProvider,
      });
      if (hunted) {
        selectedFact = hunted;
        factHuntLlm = true;
      }
    }

    const selectedFactWhy = factHuntLlm
      ? explainLlmFactSelection(selectedFact!)
      : explainReferenceFactSelection(factBundle, selectedFact);

    const referenceFacts = selectedFact
      ? [selectedFact.fact]
      : [...factBundle.trackFacts, ...factBundle.artistFacts].slice(0, 4);

    if (referenceFacts.length === 0) {
      throw new NoReferenceFactsError(metadata.artist, metadata.title);
    }

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
        `[story-seed] ${metadata.artist} — ${metadata.title} | scope=${selectedFact.scope}${factHuntLlm ? ' | llm-hunt' : ''} | ${selectedFact.fact}`,
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
      ttsStyle: delivery.styleId,
      ttsSpeed: delivery.speed,
      ttsEmotion: delivery.emotion,
      voiceTier,
      demo: false,
      tier: resolveUserTier(installId),
      quota: getDailyStoryQuota(req.installId ?? 'unknown'),
      sources: {
        wikipedia: trackFactCount + artistFactCount > 0,
        factCountTrack: trackFactCount,
        factCountArtist: artistFactCount,
        referenceFactPicked: Boolean(selectedFact),
        factHuntLlm,
        rawSnippetCount: factCtx.rawSnippets.length,
        musicbrainz: Boolean(metadata.year || metadata.genre || metadata.mbid),
        groq: llmUsed === 'groq',
        gemini: llmUsed === 'gemini',
        yandexTts: hasYandexCredentials(),
        azureTts: canUseAzureSpeechProduction(),
      },
    };

    if (hasYandexCredentials() || canUseAzureSpeechProduction()) {
      const id = uuidv4();
      console.log(
        `[tts] queue install=${installId.slice(0, 8)} voice=${voiceId} style=${delivery.styleId} speed=${delivery.speed} emotion=${delivery.emotion} tier=${voiceTier} provider=${ttsProvider} words=${story.word_count}`,
      );
      const audio = await synthesizeStoryAudio({
        installId,
        voiceTier,
        ttsProvider,
        script: story.script,
        voiceId,
        fileName: `${id}.ogg`,
        speed: delivery.speed,
        emotion: delivery.emotion,
        pauseProfile: delivery.pauseProfile,
        ttsStyle: delivery.styleId,
        storyNarrator,
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
      response.ttsProvider = audio.provider;
    } else {
      response.audioUrl = null;
      response.audioFile = null;
      response.ttsHint =
        'TTS не настроен: нужен YANDEX_API_KEY (база) или AZURE_SPEECH_KEY + AZURE_SPEECH_REGION (premium)';
    }

    recordStoryGeneration(installId, req);
    attachStoryQuotaHeaders(res, installId);
    console.log(
      `[story] ok install=${installId.slice(0, 8)} llm=${llmUsed} words=${story.word_count} audio=${Boolean(response.audioUrl)}`,
    );
    res.json(response);
  } catch (err) {
    if (err instanceof PremiumTtsAccessError) {
      res.status(402).json({
        error: 'Premium voice required',
        code: err.code,
        message: err.message,
        productId: 'premium_voice_monthly',
        priceRubMonthly: 199,
        source: 'billing',
      });
      return;
    }

    const rawMessage = err instanceof Error ? err.message : String(err);
    const isTts =
      /yandex tts|speechkit|tts\.api\.cloud\.yandex|elevenlabs|azure speech/i.test(rawMessage);
    if (isTts) {
      console.error(
        `[yandex-tts] story-fail install=${installId.slice(0, 8)} artist="${artist}" title="${title}" speed=${(req.body as StoryFullBody).tts_speed} emotion=${(req.body as StoryFullBody).tts_emotion} err=${rawMessage.slice(0, 280)}`,
      );
    } else {
      console.error(
        `[story] fail install=${installId.slice(0, 8)} llm=${llmProvider} artist="${artist}" title="${title}" err=${rawMessage.slice(0, 300)}`,
      );
    }
    if (isNoReferenceFactsError(err)) {
      setLogDetail(res, 'code=NO_REFERENCE_FACTS no grounded facts from sources');
      res.status(503).json({
        error: 'Story generation unavailable',
        code: 'NO_REFERENCE_FACTS',
        message:
          'Не нашли проверенных фактов про этот трек — история не сгенерирована, чтобы не выдумывать. Попробуй через минуту или другой трек.',
        source: 'facts',
      });
      return;
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
