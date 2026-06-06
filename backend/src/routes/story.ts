import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAppAuth } from '../middleware/app-auth.js';
import { validateStoryFullBody } from '../middleware/validate-story.js';
import { enrichTrackMetadata } from '../services/musicbrainz.js';
import { fetchAggregatedFactContext, emptyAggregatedFactContext, fetchIndieArtistFocusContext } from '../services/fact-aggregator.js';
import { explainReferenceFactSelection, type SelectedReferenceFact } from '../services/fact-picker.js';
import { formatFactPickLog, logFactCandidatePools } from '../services/fact-interest-log.js';
import { interestScore } from '../services/reference-fact-quality.js';
import { interestRating10 } from '../services/fact-interest-log.js';
import {
  collectPreviousScripts,
  countUnusedBankFactsForUser,
  ensureAccount,
  ingestBundleToBank,
  pickBankFactForUser,
  pickFactForUser,
  prefetchArtistFactsToBank,
  recordUserStory,
} from '../services/fact-user-service.js';
import { ingestFacts } from '../services/fact-bank.js';
import { resolveArtistTier } from '../services/artist-notability.js';
import { buildMetadataFallbackFacts, countGroundedFacts, isMetadataOnlyFallbackFact } from '../services/metadata-facts.js';
import { factAppliesToRequest } from '../services/fact-relevance.js';
import {
  explainLlmFactSelection,
  huntReferenceFactWithLlm,
  shouldRunLlmFactHunt,
  explainFactHuntDecision,
} from '../services/story-llm-fact-hunt.js';
import { hasLlmKeyForProvider, resolveLlmProvider, resolveEffectiveStoryLlmProvider, clientKeyForProvider, type ClientLlmKeys, type ClientLocalOllama } from '../services/llm-provider.js';
import { generateStoryWithFallback } from '../services/story-llm-router.js';
import { fetchArtistWikiLead } from '../services/wikipedia-lead.js';
import { translateWikiLeadToStory } from '../services/indie-wiki-story.js';
import {
  pickArtistWikiContent,
} from '../services/artist-wiki-depth.js';
import { primaryArtistName } from '../services/artist-primary.js';
import { isMusicArtistWikiExtract } from '../services/wikipedia-music.js';
import { countWords, detectStoryQualityWarnings, sanitizeScriptForTts } from '../services/story-quality.js';
import type { StoryScript } from '../services/groq.js';
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
import {
  attachStoryQuotaHeaders,
  getDailyStoryQuota,
  rateLimitStory,
  recordStoryGeneration,
} from '../middleware/rate-limit.js';
import {
  getStoryLimitsForTier,
  resolveOpenRouterModelForTier,
  resolveOpenRouterFactModelsForTier,
  resolveOpenRouterStoryModelsForTier,
  tierQuotaHintRu,
} from '../services/tier-policy.js';
import { classifyStoryLlmError } from '../services/llm-error-message.js';
import { StoryTiming } from '../services/story-timing.js';
import { recordFactMiss } from '../services/fact-miss-log.js';
import { isNoReferenceFactsError, NoReferenceFactsError, isCoverOnHoldError, CoverOnHoldError } from '../services/story-errors.js';
import { assessCoverSituation } from '../services/cover-policy.js';
import {
  isValidFeedbackReason,
  recordStoryFeedback,
  type FeedbackVote,
} from '../services/story-feedback.js';
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
  groq_model?: string;
  openrouter_model?: string;
  groq_api_key?: string;
  gemini_api_key?: string;
  openrouter_api_key?: string;
  local_ollama_url?: string;
  local_ollama_model?: string;
}

router.get('/quota', (req: Request, res: Response) => {
  const installId = req.installId ?? 'unknown';
  const tier = resolveUserTier(installId);
  const quota = getDailyStoryQuota(installId);
  const limits = getStoryLimitsForTier(tier);
  attachStoryQuotaHeaders(res, installId);
  const freeProfiles =
    tier === 'free'
      ? {
          economy: { dailyStories: 10, model: 'nvidia/nemotron-3-nano-30b-a3b:free' },
          quality: { dailyStories: 5, model: 'google/gemma-4-26b-a4b-it:free' },
        }
      : undefined;
  res.json({
    tier,
    premium: hasPremiumEntitlement(installId),
    quota,
    freeProfiles,
    limits: {
      dailyStories: limits.dailyStories,
      monthlyStories: limits.monthlyStories,
      labelRu: limits.labelRu,
    },
    hint: tierQuotaHintRu(tier),
    premiumVoiceHint: premiumUpsellHintRu(tier),
    premiumTtsReady: canUseAzureSpeechProduction(),
    azureSpeech: hasAzureSpeechCredentials() && isAzureSpeechEnabled(),
  });
});

function storyFullRateLimit(req: Request, res: Response, next: import('express').NextFunction): void {
  const installId = req.installId ?? 'unknown';
  const body = req.body as StoryFullBody;
  const provider = resolveEffectiveStoryLlmProvider(resolveUserTier(installId), body.llm_provider, {
    groq: body.groq_api_key,
    gemini: body.gemini_api_key,
    openrouter: body.openrouter_api_key,
  });
  const ownKey = Boolean(clientKeyForProvider(provider, {
    groq: body.groq_api_key,
    gemini: body.gemini_api_key,
    openrouter: body.openrouter_api_key,
  }));
  rateLimitStory(installId, {
    skipDailyQuota: ownKey,
    freeOpenRouterModel: body.openrouter_model,
  })(req, res, next);
}

router.post('/full', validateStoryFullBody, storyFullRateLimit, async (req: Request, res: Response) => {
  const installId = req.installId ?? 'unknown';
  const body = req.body as StoryFullBody;
  console.log(
    `[story] <<< request install=${installId.slice(0, 8)} llm=${body.llm_provider ?? 'missing'} ` +
      `artist="${body.artist}" title="${body.title}"`,
  );

  const requestedProviderRaw = body.llm_provider;
  const userTier = resolveUserTier(installId);
  const clientLlmKeys: ClientLlmKeys = {
    groq: body.groq_api_key,
    gemini: body.gemini_api_key,
    openrouter: body.openrouter_api_key,
  };
  const clientLocal: ClientLocalOllama = {
    baseUrl: body.local_ollama_url,
    model: body.local_ollama_model,
  };
  const llmProvider = resolveEffectiveStoryLlmProvider(userTier, body.llm_provider, clientLlmKeys);
  const ownLlmKey = llmProvider === 'local'
    ? Boolean(clientLocal.baseUrl?.trim())
    : Boolean(clientKeyForProvider(llmProvider, clientLlmKeys));
  if (!hasLlmKeyForProvider(llmProvider, clientLlmKeys, clientLocal)) {
    const code =
      llmProvider === 'local'
        ? 'LOCAL_OLLAMA_NOT_CONFIGURED'
        : llmProvider === 'gemini'
        ? 'GEMINI_NOT_CONFIGURED'
        : llmProvider === 'openrouter'
          ? 'OPENROUTER_NOT_CONFIGURED'
          : 'GROQ_NOT_CONFIGURED';
    const message =
      llmProvider === 'local'
        ? 'Локальный Ollama не настроен. Укажи URL (ZeroTier) в настройках приложения или LOCAL_OLLAMA_BASE_URL на сервере.'
        : llmProvider === 'gemini'
        ? 'Gemini не настроен на сервере. Добавь GEMINI_API_KEY или свой ключ в настройках приложения.'
        : llmProvider === 'openrouter'
          ? 'OpenRouter не настроен на сервере. Добавь OPEN_ROUTER_API_KEY на Railway или свой ключ в приложении.'
          : 'Groq не настроен на сервере. Добавь GROQ_API_KEY или свой ключ в настройках приложения.';
    res.status(503).json({
      error: 'Story generation unavailable',
      code,
      message,
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
  const groqModel = (req.body as StoryFullBody).groq_model;
  const openrouterModelRequested = (req.body as StoryFullBody).openrouter_model;
  const clientOwnOpenRouter = Boolean(clientLlmKeys.openrouter?.trim());
  const openrouterModelFact = resolveOpenRouterModelForTier(
    userTier,
    openrouterModelRequested,
    'fact',
    { clientOwnKey: clientOwnOpenRouter },
  );
  const openrouterModelStory = resolveOpenRouterModelForTier(
    userTier,
    openrouterModelRequested,
    'story',
    { clientOwnKey: clientOwnOpenRouter },
  );
  if (
    openrouterModelRequested?.trim() &&
    openrouterModelRequested.trim() !== openrouterModelStory &&
    !clientOwnOpenRouter
  ) {
    console.log(
      `[settings] tier=${userTier} server model ${openrouterModelStory} (client sent ${openrouterModelRequested.trim()})`,
    );
  }

  const modelLog =
    llmProvider === 'local'
      ? ` ollama=${clientLocal.baseUrl ?? 'default'} model=${clientLocal.model ?? 'default'}`
      : llmProvider === 'gemini'
      ? ` model=${geminiModel ?? 'default'}`
      : llmProvider === 'groq'
        ? ` model=${groqModel ?? 'default'}`
        : llmProvider === 'openrouter'
          ? ` fact=${openrouterModelFact} story=${openrouterModelStory} tier=${userTier}`
          : '';

  console.log(
    `[settings] install=${installId.slice(0, 8)} tier=${userTier} user_llm=${requestedProviderRaw ?? 'missing'} active_llm=${llmProvider}${modelLog} own_key=${ownLlmKey}`,
  );
  console.log(
    `[story] start install=${installId.slice(0, 8)} requested_llm=${requestedProviderRaw ?? 'missing'} llm=${llmProvider}${modelLog}` +
      ` narrator=${storyNarrator} artist="${artist}" title="${title}"`,
  );

  const timing = new StoryTiming(installId, artist, title);

  try {
    timing.mark('request');

    const metadata = await enrichTrackMetadata(artist, title);
    timing.mark('metadata', `year=${metadata.year ?? '-'} mbid=${metadata.mbid ? 'yes' : 'no'}`);
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

    const clientPreviousScripts = Array.isArray(previousScriptsRaw)
      ? previousScriptsRaw.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];
    const accountPreviousScripts = await collectPreviousScripts(installId, artist, title);
    const previousScripts = [
      ...new Set([...clientPreviousScripts, ...accountPreviousScripts]),
    ];

    ensureAccount(installId);
    const bankFact = await pickBankFactForUser(installId, metadata.artist, metadata.title);
    let factCtx = emptyAggregatedFactContext();
    let factBundle = factCtx.bundle;
    let trackFactCount = 0;
    let artistFactCount = 0;
    let selectedFact: SelectedReferenceFact | null = bankFact;
    let factFromBank = Boolean(bankFact);

    if (bankFact) {
      const unused = await countUnusedBankFactsForUser(installId, metadata.artist, metadata.title);
      console.log(
        `[facts] cache hit install=${installId.slice(0, 8)} artist="${metadata.artist}" title="${metadata.title}" ` +
          `unusedInBank=${unused} — skip wiki/web/ddg (seed already saved)`,
      );
      timing.mark('facts-fetched', `source=bank unused=${unused}`);
      console.log(formatFactPickLog(bankFact, 'bank'));
    } else {
      factCtx = await fetchAggregatedFactContext(
        metadata.artist,
        metadata.title,
        metadata.countryCode,
        metadata.mbid,
        metadata.artistMbid,
      );
      timing.mark(
        'facts-fetched',
        `track=${factCtx.bundle.trackFacts.length} artist=${factCtx.bundle.artistFacts.length} snippets=${factCtx.rawSnippets.length}`,
      );
      factBundle = factCtx.bundle;
      trackFactCount = factBundle.trackFacts.length;
      artistFactCount = factBundle.artistFacts.length;
      const firstFetchMs = timing.totalMs();
      if (trackFactCount + artistFactCount === 0) {
        const skipRetry =
          firstFetchMs >= 18_000 ||
          factCtx.rawSnippets.length >= 2;
        if (skipRetry) {
          console.warn(
            `[facts] skip empty-bundle retry for "${metadata.artist}" — ${firstFetchMs}ms snippets=${factCtx.rawSnippets.length}`,
          );
        } else {
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
      }
      console.log(
        `[facts] ${metadata.artist} — ${metadata.title}: track=${trackFactCount} artist=${artistFactCount} rawSnippets=${factCtx.rawSnippets.length}`,
      );

      const artistTierForLog = resolveArtistTier(
        metadata.artist,
        metadata.title,
        metadata,
        factBundle,
      );
      console.log(`[facts] tier=${artistTierForLog} artist="${metadata.artist}"`);
      logFactCandidatePools(factBundle, metadata.artist, metadata.title);

      if (trackFactCount + artistFactCount === 0) {
        const metaFacts = buildMetadataFallbackFacts(metadata);
        factBundle = { ...factBundle, artistFacts: metaFacts };
        artistFactCount = metaFacts.length;
        console.log(`[facts] metadata-only seeds (${metaFacts.length}) for "${metadata.artist}"`);
      }

      ingestBundleToBank(metadata.artist, metadata.title, factBundle);
      prefetchArtistFactsToBank(installId, metadata.artist, metadata.title, factBundle);

      selectedFact = await pickFactForUser(
        installId,
        factBundle,
        metadata.artist,
        metadata.title,
        previousScripts.length,
      );
      console.log(formatFactPickLog(selectedFact, 'rules'));
    }

    const artistTier = resolveArtistTier(
      metadata.artist,
      metadata.title,
      metadata,
      factBundle,
    );
    if (factFromBank) {
      console.log(`[facts] tier=${artistTier} artist="${metadata.artist}" (bank seed)`);
    }

    let factHuntLlm = false;
    const bundleFactCount = trackFactCount + artistFactCount;
    const groundedFactCount = countGroundedFacts(factBundle);

    if (
      !factFromBank &&
      shouldRunLlmFactHunt(
        selectedFact,
        factCtx.rawSnippets.length,
        groundedFactCount,
        trackFactCount,
        metadata.title,
        metadata.artist,
      )
    ) {
      const factModels =
        ownLlmKey && openrouterModelFact.includes('/')
          ? [openrouterModelFact]
          : resolveOpenRouterFactModelsForTier(userTier, openrouterModelRequested);
      console.log(
        `[fact-hunt-llm] start artist="${metadata.artist}" title="${metadata.title}" ` +
          `snippets=${factCtx.rawSnippets.length} models=${factModels.join(' → ')} ` +
          `rulesInterest=${selectedFact?.interestRating ?? 0}/10 score=${selectedFact?.interestScore ?? 0}`,
      );
      const hunted = await huntReferenceFactWithLlm({
        artist: metadata.artist,
        title: metadata.title,
        year: metadata.year,
        genre: metadata.genre,
        rawSnippets: factCtx.rawSnippets,
        preferredProvider: llmProvider,
        openRouterModel: openrouterModelFact,
        openRouterModels: factModels,
      });
      if (hunted) {
        selectedFact = hunted;
        factHuntLlm = true;
        ingestFacts(metadata.artist, metadata.title, [
          { fact: hunted.fact, scope: hunted.scope, source: 'llm' },
        ]);
        console.log(formatFactPickLog(selectedFact, 'llm'));
      }
    } else if (selectedFact) {
      console.log(
        `[fact-hunt-llm] skip reason=${explainFactHuntDecision(
          selectedFact,
          factCtx.rawSnippets.length,
          groundedFactCount,
          trackFactCount,
          metadata.title,
        )} interest=${selectedFact.interestRating}/10 score=${selectedFact.interestScore} snippets=${factCtx.rawSnippets.length}`,
      );
    }

    const selectedFactWhy = factFromBank
      ? 'seed from facts-bank — saved earlier, not yet told to this user'
      : factHuntLlm
        ? explainLlmFactSelection(selectedFact!)
        : explainReferenceFactSelection(factBundle, selectedFact, metadata.artist, metadata.title);

    let referenceFacts = selectedFact
      ? [selectedFact.fact]
      : [...factBundle.trackFacts, ...factBundle.artistFacts].slice(0, 4);

    if (!selectedFact) {
      const validatedPool = [...factBundle.trackFacts, ...factBundle.artistFacts].filter(
        (fact) =>
          factAppliesToRequest(fact, metadata.artist, metadata.title, 'track') ||
          factAppliesToRequest(fact, metadata.artist, metadata.title, 'artist'),
      );
      const fallbackFact = validatedPool[0];
      if (fallbackFact) {
        const scope: 'track' | 'album' | 'artist' = factAppliesToRequest(
          fallbackFact,
          metadata.artist,
          metadata.title,
          'track',
        )
          ? 'track'
          : 'artist';
        selectedFact = {
          fact: fallbackFact,
          scope,
          scopeLabelRu: scope === 'track' ? 'трек' : 'группа/артист',
          interestScore: interestScore(fallbackFact),
          interestRating: interestRating10(fallbackFact),
        };
        console.log(formatFactPickLog(selectedFact, 'rules'));
        referenceFacts = [selectedFact.fact];
      }
    }

    if (!selectedFact && referenceFacts.length === 0 && artistTier === 'indie') {
      console.log(
        `[facts] indie artist-only retry for "${metadata.artist}" — "${metadata.title}"`,
      );
      const indieCtx = await fetchIndieArtistFocusContext(
        metadata.artist,
        metadata.title,
        metadata.countryCode,
        metadata.artistMbid,
      );
      const indieCount = indieCtx.bundle.artistFacts.length + indieCtx.bundle.trackFacts.length;
      if (indieCount > 0) {
        factBundle = indieCtx.bundle;
        factCtx = {
          ...factCtx,
          rawSnippets: [...new Set([...factCtx.rawSnippets, ...indieCtx.rawSnippets])],
        };
        trackFactCount = factBundle.trackFacts.length;
        artistFactCount = factBundle.artistFacts.length;
        ingestBundleToBank(metadata.artist, metadata.title, factBundle);
        selectedFact = await pickFactForUser(
          installId,
          factBundle,
          metadata.artist,
          metadata.title,
          previousScripts.length,
        );
        if (selectedFact) {
          console.log(formatFactPickLog(selectedFact, 'rules'));
          referenceFacts = [selectedFact.fact];
        } else {
          referenceFacts = [
            ...factBundle.trackFacts,
            ...factBundle.artistFacts,
          ].slice(0, 4);
        }
      } else {
        recordFactMiss({
          installId,
          artist: metadata.artist,
          title: metadata.title,
          reason: 'indie_no_artist_fact',
          artistTier,
        });
      }
    }

    if (!selectedFact && referenceFacts.filter((f) => !isMetadataOnlyFallbackFact(f)).length === 0) {
      const wikiSalvage = await pickArtistWikiContent({
        installId,
        artist: metadata.artist,
        previousScripts,
      });
      if (wikiSalvage && isMusicArtistWikiExtract(wikiSalvage.text)) {
        selectedFact = {
          fact: wikiSalvage.text,
          scope: 'artist',
          scopeLabelRu: 'группа/артист',
          interestScore: interestScore(wikiSalvage.text),
          interestRating: interestRating10(wikiSalvage.text),
        };
        referenceFacts = [wikiSalvage.text];
        console.log(
          `[facts] wiki salvage seed for "${metadata.artist}" chars=${wikiSalvage.text.length}`,
        );
      } else {
        recordFactMiss({
          installId,
          artist: metadata.artist,
          title: metadata.title,
          reason: 'no_reference_facts',
          artistTier,
        });
        throw new NoReferenceFactsError(metadata.artist, metadata.title);
      }
    }

    const finalReferenceFacts = selectedFact ? [selectedFact.fact] : referenceFacts;

    const coverSituation = assessCoverSituation(
      metadata.artist,
      metadata.title,
      selectedFact,
      factBundle,
      artistTier,
    );
    if (coverSituation.action === 'hold') {
      recordFactMiss({
        installId,
        artist: metadata.artist,
        title: metadata.title,
        reason: 'cover_ambiguous',
        artistTier,
      });
      throw new CoverOnHoldError(metadata.artist, metadata.title);
    }
    if (coverSituation.action === 'pivot_artist') {
      selectedFact = coverSituation.artistFact;
    }

    const storyReferenceFacts =
      coverSituation.action === 'pivot_artist'
        ? coverSituation.referenceFacts
        : selectedFact
          ? [selectedFact.fact]
          : finalReferenceFacts;

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
      referenceFacts: storyReferenceFacts,
      artistTier,
      selectedReferenceFact: selectedFact ?? undefined,
      rawSnippets:
        coverSituation.action !== 'pivot_artist' &&
        artistTier === 'major' &&
        storyReferenceFacts.length <= 1 &&
        factCtx.rawSnippets.length > 0
          ? factCtx.rawSnippets
          : undefined,
      geminiModel,
      groqModel,
      openRouterModel: openrouterModelStory,
      openRouterModels: clientOwnOpenRouter
        ? [openrouterModelStory]
        : resolveOpenRouterStoryModelsForTier(userTier, openrouterModelRequested),
      clientGroqApiKey: clientLlmKeys.groq,
      clientGeminiApiKey: clientLlmKeys.gemini,
      clientOpenRouterApiKey: clientLlmKeys.openrouter,
      localOllamaBaseUrl: clientLocal.baseUrl,
      localOllamaModel: clientLocal.model,
    };

    if (selectedFact?.fact) {
      const seedSource = factFromBank ? 'bank' : factHuntLlm ? 'llm' : 'rules';
      console.log(
        formatFactPickLog(selectedFact, seedSource) +
          ` track="${metadata.title}" artist="${metadata.artist}"`,
      );
      console.log(`[story-seed-why] ${selectedFactWhy}`);
    }
    timing.mark(
      'seed-ready',
      selectedFact
        ? `scope=${selectedFact.scope} score=${selectedFact.interestScore} rating=${selectedFact.interestRating}/10`
        : 'no-seed',
    );

    const { story, llmUsed } = await (async () => {
      const hasGroundedSeed = Boolean(selectedFact?.fact && selectedFact.interestScore >= 6);
      let effectiveStoryInput = storyInput;

      if (!hasGroundedSeed && !factFromBank) {
        const wikiLeadRaw = await pickArtistWikiContent({
          installId,
          artist: metadata.artist,
          previousScripts,
        });
        const wikiLead =
          wikiLeadRaw && isMusicArtistWikiExtract(wikiLeadRaw.text) ? wikiLeadRaw : null;
        if (wikiLeadRaw && !wikiLead) {
          console.warn(
            `[indie-wiki] skip non-music wiki for "${primaryArtistName(metadata.artist)}"`,
          );
        }
        if (!wikiLead) {
          console.warn(
            `[indie-wiki] no wiki lead for "${primaryArtistName(metadata.artist)}" — cannot ground story`,
          );
          const onlyPlaceholder =
            storyReferenceFacts.length === 0 ||
            storyReferenceFacts.every(isMetadataOnlyFallbackFact);
          if (onlyPlaceholder) {
            throw new NoReferenceFactsError(metadata.artist, metadata.title);
          }
        }
        if (wikiLead) {
          console.log(
            `[indie-wiki] lead lang=${wikiLead.lang} chars=${wikiLead.text.length} artist="${primaryArtistName(metadata.artist)}"`,
          );
          const wikiScript = await translateWikiLeadToStory({
            artist: metadata.artist,
            title: metadata.title,
            wikiLead: wikiLead.text,
            wikiLang: wikiLead.lang,
            llmProvider,
            clientGroqApiKey: clientLlmKeys.groq,
            clientGeminiApiKey: clientLlmKeys.gemini,
            clientOpenRouterApiKey: clientLlmKeys.openrouter,
            openRouterModel: openrouterModelStory,
          });
          const wikiScriptFinal =
            wikiScript ??
            (wikiLead.lang === 'ru'
              ? sanitizeScriptForTts(wikiLead.text, metadata.artist, metadata.title, [wikiLead.text])
              : null);
          if (wikiScriptFinal && countWords(wikiScriptFinal) >= 45) {
            selectedFact = {
              fact: wikiLead.text,
              scope: 'artist',
              scopeLabelRu: 'группа/артист',
              interestScore: interestScore(wikiLead.text),
              interestRating: interestRating10(wikiLead.text),
            };
            const scripted: StoryScript = {
              script: wikiScriptFinal,
              word_count: countWords(wikiScriptFinal),
              voiceId,
            };
            return { story: scripted, llmUsed: wikiScript ? `${llmProvider}+wiki` : 'wiki-ru' };
          }
          if (!wikiScript) {
            console.warn(`[indie-wiki] translate failed for "${metadata.artist}" — wiki lead → story LLM`);
          }
          const wikiReferenceFacts = [
            wikiLead.text,
            ...storyReferenceFacts.filter((f) => !isMetadataOnlyFallbackFact(f)),
          ].slice(0, 4);
          effectiveStoryInput = {
            ...storyInput,
            referenceFacts: wikiReferenceFacts,
            selectedReferenceFact: {
              fact: wikiLead.text,
              scope: 'artist',
              scopeLabelRu: 'группа/артист',
              interestScore: interestScore(wikiLead.text),
              interestRating: interestRating10(wikiLead.text),
            },
            rawSnippets: undefined,
          };
        }
      }

      const refFacts = effectiveStoryInput.referenceFacts ?? [];
      const groundedSeed = effectiveStoryInput.selectedReferenceFact?.fact?.trim() ?? '';
      const seedScore = effectiveStoryInput.selectedReferenceFact?.interestScore ?? 0;
      const hasRealSeed =
        groundedSeed.length > 0 &&
        seedScore >= 6 &&
        !isMetadataOnlyFallbackFact(groundedSeed);
      if (
        !factFromBank &&
        !hasRealSeed &&
        (refFacts.length === 0 || refFacts.every(isMetadataOnlyFallbackFact))
      ) {
        throw new NoReferenceFactsError(metadata.artist, metadata.title);
      }

      return generateStoryWithFallback(effectiveStoryInput, llmProvider, {
        serverManaged: userTier === 'free' && !ownLlmKey,
      });
    })();

    timing.mark('story-text', `llm=${llmUsed} words=${story.word_count}`);

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
        factFromBank,
        factHuntLlm,
        rawSnippetCount: factCtx.rawSnippets.length,
        musicbrainz: Boolean(metadata.year || metadata.genre || metadata.mbid),
        groq: llmUsed === 'groq',
        gemini: llmUsed === 'gemini',
        openrouter: llmUsed === 'openrouter',
        local: llmUsed === 'local',
        yandexTts: hasYandexCredentials(),
        azureTts: canUseAzureSpeechProduction(),
      },
    };

    const qualityWarnings = detectStoryQualityWarnings(story.script, storyReferenceFacts);
    if (qualityWarnings.length > 0) {
      response.qualityWarnings = qualityWarnings;
      console.warn(
        `[story-quality] warnings=${qualityWarnings.join(',')} install=${installId.slice(0, 8)} ` +
          `"${metadata.artist}" — "${metadata.title}"`,
      );
    }

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

    timing.mark('tts-ready', `audio=${Boolean(response.audioUrl)}`);

    recordStoryGeneration(installId, req, { freeOpenRouterModel: openrouterModelRequested });
    if (selectedFact?.fact) {
      await recordUserStory(installId, {
        artist: metadata.artist,
        title: metadata.title,
        script: story.script,
        seed: selectedFact,
      });
    }
    attachStoryQuotaHeaders(res, installId);
    console.log(
      `[story] ok install=${installId.slice(0, 8)} llm=${llmUsed} words=${story.word_count} audio=${Boolean(response.audioUrl)} totalMs=${timing.totalMs()}`,
    );
    timing.mark('response-ready');
    console.warn('[story] script-text-begin');
    console.warn(story.script.trim());
    console.warn('[story] script-text-end');
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
    timing.mark('failed', rawMessage.slice(0, 80));
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
          'Извините, по такому треку или группе рассказать историю не получилось — проверенных фактов не нашли.',
        source: 'facts',
      });
      return;
    }
    if (isCoverOnHoldError(err)) {
      setLogDetail(res, 'code=COVER_AMBIGUOUS possible cover without explicit marker');
      res.status(503).json({
        error: 'Story generation unavailable',
        code: 'COVER_AMBIGUOUS',
        message:
          'Похоже, это кавер без явной пометки — чтобы не перепутать с оригиналом, историю по этому треку пока не рассказываем.',
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

router.post('/feedback', (req: Request, res: Response) => {
  const installId = req.installId!;
  const artist = typeof req.body?.artist === 'string' ? req.body.artist.trim() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const voteRaw = typeof req.body?.vote === 'string' ? req.body.vote.trim().toLowerCase() : '';
  const script = typeof req.body?.script === 'string' ? req.body.script.trim() : undefined;

  if (!artist || !title) {
    res.status(400).json({ error: 'artist and title required' });
    return;
  }
  if (voteRaw !== 'like' && voteRaw !== 'dislike') {
    res.status(400).json({ error: 'vote must be like or dislike' });
    return;
  }
  const vote = voteRaw as FeedbackVote;

  const reasonsRaw = req.body?.reasons;
  const reasons: string[] = Array.isArray(reasonsRaw)
    ? reasonsRaw
        .filter((r): r is string => typeof r === 'string')
        .map((r) => r.trim())
        .filter(Boolean)
    : typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? [req.body.reason.trim()]
      : [];

  const uniqueReasons = [...new Set(reasons)];
  if (uniqueReasons.length === 0 || !uniqueReasons.every((r) => isValidFeedbackReason(vote, r))) {
    res.status(400).json({ error: 'invalid reason for vote' });
    return;
  }

  const ids = uniqueReasons.map((reason) =>
    recordStoryFeedback({ installId, artist, title, vote, reason, script }).id,
  );
  res.json({ ok: true, ids, count: ids.length });
});

export default router;
