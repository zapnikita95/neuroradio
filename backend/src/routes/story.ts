import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAppAuth } from '../middleware/app-auth.js';
import { validateStoryFullBody } from '../middleware/validate-story.js';
import { extractClientSecrets } from '../middleware/client-secrets.js';
import { enrichTrackMetadata } from '../services/musicbrainz.js';
import {
  fetchAggregatedFactContext,
  emptyAggregatedFactContext,
  fetchIndieArtistFocusContext,
  fetchEmergencyFactRescue,
  fetchDiscogsFactFallback,
} from '../services/fact-aggregator.js';
import { fetchDeepWebSearchSnippets, fetchArtistIdentityWebSnippets } from '../services/web-search-facts.js';
import { fetchFastTrackWikiFacts } from '../services/wikipedia-facts.js';
import { explainReferenceFactSelection, factsTooSimilar, isRejectedStorySeed, type SelectedReferenceFact } from '../services/fact-picker.js';
import { formatFactPickLog, logFactCandidatePools } from '../services/fact-interest-log.js';
import { interestScore, isWikiBiographyLead, isCatalogMetadataSeed } from '../services/reference-fact-quality.js';
import { interestRating10 } from '../services/fact-interest-log.js';
import {
  buildFactPickContext,
  collectPreviousScripts,
  countUnusedBankFactsForUser,
  ensureAccount,
  ingestBundleToBank,
  pickBankFactForUser,
  pickFactForUser,
  prefetchArtistFactsToBank,
  recordUserStory,
  reserveSeedForUser,
  rollbackReservedSeed,
} from '../services/fact-user-service.js';
import { classifyFactTopic, FACT_TOPIC_LABELS_RU } from '../services/fact-topic.js';
import { factFitsStoryLanguage } from '../services/fact-language-fit.js';
import { ingestFacts, factFingerprint } from '../services/fact-bank.js';
import { resolveArtistTier, isCatalogMajorArtist } from '../services/artist-notability.js';
import { buildMetadataFallbackFacts, countGroundedFacts, isMetadataOnlyFallbackFact } from '../services/metadata-facts.js';
import { factAppliesToRequest } from '../services/fact-relevance.js';
import {
  explainLlmFactSelection,
  huntReferenceFactWithLlm,
  huntMajorArtistCatalogFact,
  shouldRunLlmFactHunt,
  explainFactHuntDecision,
} from '../services/story-llm-fact-hunt.js';
import { pickSalvageSnippetSeed, pickRelaxedSnippetSeed, isWeakSelectedFact, isWeakSnippetSeed } from '../services/search-snippet-salvage.js';
import { hasActionableSnippets } from '../services/web-snippet-accept.js';
import { factMentionsArtistLoose } from '../services/fact-relevance.js';
import { hasLlmKeyForProvider, resolveLlmProvider, resolveEffectiveStoryLlmProvider, clientKeyForProvider, type ClientLlmKeys, type ClientLocalOllama } from '../services/llm-provider.js';
import { generateStoryWithFallback } from '../services/story-llm-router.js';
import { fetchArtistWikiLead } from '../services/wikipedia-lead.js';
import { resolveCoverForFacts } from '../services/cover-resolve.js';
import { lookupCuratedFact } from '../services/curated-facts.js';
import { translateWikiLeadToStory } from '../services/indie-wiki-story.js';
import {
  pickArtistWikiContent,
  tryRetryArtistWikiSeed,
} from '../services/artist-wiki-depth.js';
import { primaryArtistName } from '../services/artist-primary.js';
import { isMusicArtistWikiExtract } from '../services/wikipedia-music.js';
import { countWords, detectStoryQualityWarnings, sanitizeScriptForTts } from '../services/story-quality.js';
import type { StoryScript } from '../services/groq.js';
import { setLogDetail } from '../middleware/request-logger.js';
import { hasYandexCredentials } from '../services/yandex-tts.js';
import {
  requiresMobileWavPlayback,
  storyAudioExtensionForClient,
} from '../services/client-audio-format.js';
import {
  canSynthesizeServerTts,
  hasUserTtsCredentials,
  parseUserTtsCredentials,
} from '../services/user-tts-credentials.js';
import { coerceVoiceForSpeechKit } from '../services/voices.js';
import { resolveVoiceDelivery } from '../services/tts-voice-profiles.js';
import type { TtsVoiceStyleId } from '../services/tts-voice-profiles.js';
import {
  assertFreeTierTtsAvailable,
  resolveStoryTtsProvider,
  shouldSkipDailyStoryQuota,
  FreeTierEdgeTtsError,
  SpeechKitSubscriptionRequiredError,
} from '../services/tts-access.js';
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
  DAY_MS,
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
import { OPENROUTER_FREE_STABLE_MODEL } from '../services/openrouter-models.js';
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
import { updateHistoryVoteAsync } from '../services/account-store.js';
import {
  claimStoryGeneration,
  releaseStoryGeneration,
  StoryRequestAbortedError,
  StoryRequestDuplicateError,
  throwIfStoryAborted,
} from '../services/story-request-abort.js';
import type { StoryLengthId } from '../services/story-length.js';
import { getNarratorPreset, type StoryNarratorId } from '../services/story-narrator.js';
import type { TtsVoiceSetting } from '../services/voices.js';
import type { TtsEmotion } from '../services/tts-options.js';
import { formatUserFacingTranscript } from '../services/tts-user-display.js';
const router = Router();

router.use(requireAppAuth);

interface StoryFullBody {
  artist: string;
  title: string;
  album?: string;
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
  yandex_api_key?: string;
  yandex_folder_id?: string;
  salute_auth_key?: string;
  salute_client_id?: string;
  salute_client_secret?: string;
  user_tts_provider?: 'yandex' | 'sber';
  /** Client-side Android TTS — skip Yandex/Salute synthesis to save cost during testing. */
  skip_server_tts?: boolean;
  edge_voice_preset?: string;
  speak_track_names_in_voiceover?: boolean;
  /** ios/android — server must synthesize WAV only (see client-audio-format.ts). */
  client_platform?: 'ios' | 'android' | string;
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
          economy: { dailyStories: 10, model: OPENROUTER_FREE_STABLE_MODEL },
          quality: { dailyStories: 5, model: OPENROUTER_FREE_STABLE_MODEL },
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

/** Major artists: wiki bio is enough for story LLM when MB/wiki timed out on first pass. */
function acceptWikiArtistSeed(text: string, tier: 'major' | 'indie', artist: string): boolean {
  if (!isMusicArtistWikiExtract(text)) return false;
  if (!factMentionsArtistLoose(text, artist)) return false;
  if (tier === 'major') return text.trim().length >= 80;
  return !isWikiBiographyLead(text);
}

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
  const userTtsCredentials = parseUserTtsCredentials(body);
  rateLimitStory(installId, {
    skipDailyQuota: shouldSkipDailyStoryQuota({ ownLlmKey: ownKey, userTtsCredentials }),
    freeOpenRouterModel: body.openrouter_model,
  })(req, res, next);
}

router.post('/full', extractClientSecrets, validateStoryFullBody, storyFullRateLimit, async (req: Request, res: Response) => {
  const installId = req.installId ?? 'unknown';
  let clientAbort: AbortSignal;
  try {
    clientAbort = claimStoryGeneration(installId, req, res);
  } catch (err) {
    if (err instanceof StoryRequestDuplicateError) {
      console.log(`[story] duplicate POST ignored install=${installId.slice(0, 8)}`);
      res.status(409).json({ ok: false, code: 'story_in_progress' });
      return;
    }
    throw err;
  }
  const body = req.body as StoryFullBody;
  const clientPlatform =
    typeof body.client_platform === 'string' ? body.client_platform.trim().toLowerCase() : '';
  console.log(
    `[story] <<< request install=${installId.slice(0, 8)} llm=${body.llm_provider ?? 'missing'} ` +
      `platform=${clientPlatform || 'unknown'} audio=${storyAudioExtensionForClient(body)} ` +
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
  const userTtsCredentials = parseUserTtsCredentials(body);
  if (body.user_tts_provider && !hasUserTtsCredentials(userTtsCredentials)) {
    setLogDetail(res, `code=USER_TTS_CREDENTIALS_INVALID provider=${body.user_tts_provider}`);
    res.status(400).json({
      error: 'Invalid user TTS credentials',
      code: 'USER_TTS_CREDENTIALS_INVALID',
      message:
        body.user_tts_provider === 'yandex'
          ? 'Укажи Yandex API Key и Folder ID в настройках приложения.'
          : 'Укажи Authorization Key SaluteSpeech в настройках приложения.',
    });
    return;
  }
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
    story_language: storyLanguage,
  } = req.body as StoryFullBody & { story_language?: 'ru' | 'en' };
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
  const speakTrackNamesInVoiceover = (req.body as StoryFullBody).speak_track_names_in_voiceover === true;
  console.log(
    `[story] start install=${installId.slice(0, 8)} requested_llm=${requestedProviderRaw ?? 'missing'} llm=${llmProvider}${modelLog}` +
      ` lang=${storyLanguage ?? 'ru'} narrator=${storyNarrator} speak_track_names=${speakTrackNamesInVoiceover}` +
      ` artist="${artist}" title="${title}"`,
  );

  const timing = new StoryTiming(installId, artist, title);

  try {
    timing.mark('request');
    throwIfStoryAborted(clientAbort, 'request');

    const coverCtx = resolveCoverForFacts(artist, title);
    if (coverCtx.isCover) {
      console.log(
        `[cover] "${artist}" — "${title}" → facts for "${coverCtx.factArtist}" — "${coverCtx.factTitle}"`,
      );
    }

    const metadata = await enrichTrackMetadata(coverCtx.factArtist, coverCtx.factTitle);
    timing.mark('metadata', `year=${metadata.year ?? '-'} mbid=${metadata.mbid ? 'yes' : 'no'}`);
    throwIfStoryAborted(clientAbort, 'metadata');
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

    const trackAlbum =
      typeof body.album === 'string' && body.album.trim() ? body.album.trim() : undefined;
    const storyLang = storyLanguage ?? 'ru';
    const factPickCtx = await buildFactPickContext(installId, artist, title, {
      album: trackAlbum,
      storyNarrator,
      storyLanguage: storyLang,
    });
    const usedFingerprints = factPickCtx.usedFingerprints;
    const rejectSimilarTo = factPickCtx.rejectSimilarTo;

    const curatedHit =
      lookupCuratedFact(coverCtx.factArtist, coverCtx.factTitle) ??
      lookupCuratedFact(artist, title);
    let factFromCurated = false;
    let bankFact: Awaited<ReturnType<typeof pickBankFactForUser>> = null;
    if (curatedHit) {
      const curatedFp = factFingerprint(curatedHit.fact);
      if (!usedFingerprints.has(curatedFp)) {
        ingestFacts(coverCtx.factArtist, coverCtx.factTitle, [
          { fact: curatedHit.fact, scope: curatedHit.scope, source: 'api' },
        ]);
        const curatedScore = Math.max(interestScore(curatedHit.fact), 12);
        bankFact = {
          fact: curatedHit.fact,
          scope: curatedHit.scope,
          scopeLabelRu: curatedHit.scope === 'track' ? 'трек' : 'группа/артист',
          interestScore: curatedScore,
          interestRating: interestRating10(curatedHit.fact),
        };
        factFromCurated = true;
        console.log(
          `[facts] ORIGIN=curated (ЗАГОТОВКА curated-facts.json) artist="${coverCtx.factArtist}" title="${coverCtx.factTitle}"`,
        );
      } else {
        console.log(
          `[facts] curated seed already used for "${artist}" — "${title}", fetching fresh facts`,
        );
      }
    } else {
      bankFact = await pickBankFactForUser(installId, artist, title, coverCtx, factPickCtx);
    }

    if (bankFact && usedFingerprints.has(factFingerprint(bankFact.fact))) {
      console.log(`[facts] bank seed already used for "${artist}" — "${title}", fetching fresh facts`);
      bankFact = null;
    }

    if (bankFact && !factFitsStoryLanguage(bankFact.fact, storyLang)) {
      console.log(
        `[facts] bank seed wrong language (${storyLang}) for "${artist}" — "${title}", fetching fresh facts`,
      );
      bankFact = null;
    }

    if (bankFact && factsTooSimilar(bankFact.fact, rejectSimilarTo)) {
      console.log(
        `[facts] bank seed repeats recent topic for "${artist}" — "${title}", fetching fresh facts`,
      );
      bankFact = null;
    }

    const factArtist = coverCtx.factArtist;
    const factTitle = coverCtx.factTitle;
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
      timing.mark('facts-fetched', `source=${factFromCurated ? 'curated' : 'bank'} unused=${unused}`);
      console.log(formatFactPickLog(bankFact, factFromCurated ? 'curated' : 'bank'));
    } else {
      factCtx = await fetchAggregatedFactContext(
        metadata.artist,
        metadata.title,
        metadata.countryCode,
        metadata.mbid,
        metadata.artistMbid,
        { storyLanguage: storyLanguage ?? 'ru' },
      );
      throwIfStoryAborted(clientAbort, 'facts-fetch');
      timing.mark(
        'facts-fetched',
        `track=${factCtx.bundle.trackFacts.length} artist=${factCtx.bundle.artistFacts.length} snippets=${factCtx.rawSnippets.length}`,
      );
      factBundle = factCtx.bundle;
      trackFactCount = factBundle.trackFacts.length;
      artistFactCount = factBundle.artistFacts.length;
      const firstFetchMs = timing.totalMs();
      if (trackFactCount + artistFactCount === 0) {
        const discogsCtx = await fetchDiscogsFactFallback(
          metadata.artist,
          metadata.title,
          metadata.countryCode,
        );
        if (discogsCtx) {
          factCtx = {
            ...factCtx,
            bundle: discogsCtx.bundle,
            rawSnippets: [...new Set([...factCtx.rawSnippets, ...discogsCtx.rawSnippets])],
            snippetSources: [...factCtx.snippetSources, ...discogsCtx.snippetSources],
          };
          factBundle = discogsCtx.bundle;
          trackFactCount = factBundle.trackFacts.length;
          artistFactCount = factBundle.artistFacts.length;
          timing.mark(
            'facts-discogs-fallback',
            `track=${trackFactCount} artist=${artistFactCount}`,
          );
        } else {
          const indieCtx = await fetchIndieArtistFocusContext(
            metadata.artist,
            metadata.title,
            metadata.countryCode,
            metadata.artistMbid,
          );
          if (indieCtx.bundle.trackFacts.length + indieCtx.bundle.artistFacts.length > 0) {
            factCtx = {
              ...factCtx,
              bundle: indieCtx.bundle,
              rawSnippets: [...new Set([...factCtx.rawSnippets, ...indieCtx.rawSnippets])],
              snippetSources: [...factCtx.snippetSources, ...indieCtx.snippetSources],
            };
            factBundle = indieCtx.bundle;
            trackFactCount = factBundle.trackFacts.length;
            artistFactCount = factBundle.artistFacts.length;
            timing.mark(
              'facts-indie-focus',
              `track=${trackFactCount} artist=${artistFactCount}`,
            );
          } else if (
            firstFetchMs >= 18_000 &&
            (factCtx.rawSnippets.length >= 2 ||
              hasActionableSnippets(factCtx.rawSnippets, metadata.artist, metadata.title))
          ) {
            console.warn(
              `[facts] skip empty-bundle retry for "${metadata.artist}" — ${firstFetchMs}ms snippets=${factCtx.rawSnippets.length} grounded=${countGroundedFacts(factCtx.bundle)}`,
            );
          } else {
            console.warn(
              `[facts] empty bundle for "${metadata.artist}" — "${metadata.title}", retrying wiki/web once`,
            );
            await new Promise((r) => setTimeout(r, 400));
            factCtx = await fetchAggregatedFactContext(
              metadata.artist,
              metadata.title,
              metadata.countryCode,
              metadata.mbid,
              metadata.artistMbid,
              { storyLanguage: storyLanguage ?? 'ru' },
            );
            factBundle = factCtx.bundle;
            trackFactCount = factBundle.trackFacts.length;
            artistFactCount = factBundle.artistFacts.length;
          }
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
        const relaxedSeed = pickRelaxedSnippetSeed(
          factCtx.rawSnippets,
          metadata.artist,
          metadata.title,
          storyLang,
        );
        if (relaxedSeed) {
          factBundle =
            relaxedSeed.scope === 'track'
              ? { trackFacts: [relaxedSeed.fact], artistFacts: [] }
              : { trackFacts: [], artistFacts: [relaxedSeed.fact] };
          trackFactCount = factBundle.trackFacts.length;
          artistFactCount = factBundle.artistFacts.length;
          console.log(
            `[facts] relaxed web snippet seed for "${metadata.artist}": "${relaxedSeed.fact.slice(0, 100)}"`,
          );
        }
      }

      if (trackFactCount + artistFactCount === 0) {
        const wikiFastOnly = await fetchFastTrackWikiFacts(metadata.artist, metadata.title);
        if (wikiFastOnly.length > 0) {
          factBundle = { trackFacts: wikiFastOnly.slice(0, 4), artistFacts: [] };
          trackFactCount = factBundle.trackFacts.length;
          console.log(
            `[facts] wiki-fast salvage for "${metadata.artist}" — "${metadata.title}": ${trackFactCount} fact(s)`,
          );
        }
      }

      if (trackFactCount + artistFactCount === 0) {
        const metaFacts = buildMetadataFallbackFacts(metadata);
        factBundle = { ...factBundle, artistFacts: metaFacts };
        artistFactCount = metaFacts.length;
        console.log(`[facts] metadata-only seeds (${metaFacts.length}) for "${metadata.artist}"`);
      }

      ingestBundleToBank(factArtist, factTitle, factBundle);
      if (coverCtx.isCover) {
        ingestBundleToBank(artist, title, factBundle);
      }
      prefetchArtistFactsToBank(installId, factArtist, factTitle, factBundle);

      selectedFact = await pickFactForUser(
        installId,
        factBundle,
        metadata.artist,
        metadata.title,
        previousScripts.length,
        storyNarrator,
        factPickCtx,
      );
      console.log(formatFactPickLog(selectedFact, 'rules'));
    }

    throwIfStoryAborted(clientAbort, 'facts-ready');

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
    let factFromSalvage = false;
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
      } else if (factCtx.rawSnippets.length > 0) {
        let mergedSnippets = factCtx.rawSnippets;
        if (!factCtx.deepWebSearchRan) {
          const deepSnippets = await fetchDeepWebSearchSnippets(metadata.artist, metadata.title);
          if (deepSnippets.length > 0) {
            mergedSnippets = [...new Set([...factCtx.rawSnippets, ...deepSnippets])];
            factCtx = { ...factCtx, rawSnippets: mergedSnippets, deepWebSearchRan: true };
            console.log(
              `[fact-hunt-llm] deep web retry snippets=${mergedSnippets.length} (+${deepSnippets.length})`,
            );
            const huntedDeep = await huntReferenceFactWithLlm({
              artist: metadata.artist,
              title: metadata.title,
              year: metadata.year,
              genre: metadata.genre,
              rawSnippets: mergedSnippets,
              preferredProvider: llmProvider,
              openRouterModel: openrouterModelFact,
              openRouterModels: factModels,
            });
            if (huntedDeep) {
              selectedFact = huntedDeep;
              factHuntLlm = true;
              ingestFacts(metadata.artist, metadata.title, [
                { fact: huntedDeep.fact, scope: huntedDeep.scope, source: 'llm' },
              ]);
              console.log(formatFactPickLog(selectedFact, 'llm') + ' (deep-web)');
            }
          }
        }
        if (!selectedFact) {
          const identitySnippets = await fetchArtistIdentityWebSnippets(metadata.artist);
          if (identitySnippets.length > 0) {
            mergedSnippets = [...new Set([...mergedSnippets, ...identitySnippets])];
            factCtx = { ...factCtx, rawSnippets: mergedSnippets };
            console.log(
              `[fact-hunt-llm] artist-identity retry snippets=${mergedSnippets.length} (+${identitySnippets.length})`,
            );
            const huntedIdentity = await huntReferenceFactWithLlm({
              artist: metadata.artist,
              title: metadata.title,
              year: metadata.year,
              genre: metadata.genre,
              rawSnippets: mergedSnippets,
              preferredProvider: llmProvider,
              openRouterModel: openrouterModelFact,
              openRouterModels: factModels,
            });
            if (huntedIdentity) {
              selectedFact = huntedIdentity;
              factHuntLlm = true;
              ingestFacts(metadata.artist, metadata.title, [
                { fact: huntedIdentity.fact, scope: huntedIdentity.scope, source: 'llm' },
              ]);
              console.log(formatFactPickLog(selectedFact, 'llm') + ' (artist-identity)');
            }
          }
        }
        if (!selectedFact) {
          const snippetSeed =
            pickSalvageSnippetSeed(mergedSnippets, metadata.artist, metadata.title, storyLang) ??
            pickRelaxedSnippetSeed(mergedSnippets, metadata.artist, metadata.title, storyLang);
          if (snippetSeed) {
            selectedFact = snippetSeed;
            factFromSalvage = true;
            ingestFacts(metadata.artist, metadata.title, [
              { fact: snippetSeed.fact, scope: snippetSeed.scope, source: 'api' },
            ]);
            console.log(formatFactPickLog(selectedFact, 'web-salvage'));
          }
        }
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

    if (selectedFact && isCatalogMetadataSeed(selectedFact.fact)) {
      console.warn(
        `[facts] reject catalog-metadata seed ORIGIN=${factFromCurated ? 'curated' : factFromBank ? 'bank' : 'online'} fact="${selectedFact.fact.slice(0, 100)}"`,
      );
      selectedFact = null;
    }

    if (
      selectedFact &&
      isRejectedStorySeed(
        selectedFact.fact,
        metadata.artist,
        metadata.title,
        factBundle.trackFacts,
        storyLang,
      )
    ) {
      console.warn(
        `[facts] reject unanchored seed ORIGIN=${factFromBank ? 'bank' : factFromCurated ? 'curated' : 'online'} fact="${selectedFact.fact.slice(0, 100)}"`,
      );
      if (factFromBank) factFromBank = false;
      selectedFact = null;
    }

    if (selectedFact && !factFromBank && isWeakSelectedFact(selectedFact, metadata.artist, metadata.title)) {
      console.warn(
        `[facts] reject weak seed score=${selectedFact.interestScore} fact="${selectedFact.fact.slice(0, 100)}"`,
      );
      selectedFact = null;
    }

    const selectedFactWhy = factFromCurated
      ? 'seed from curated-facts.json — verified catalog entry'
      : factFromBank
      ? 'seed from facts-bank — saved earlier, not yet told to this user'
      : factHuntLlm
        ? explainLlmFactSelection(selectedFact!)
        : explainReferenceFactSelection(factBundle, selectedFact, metadata.artist, metadata.title);

    let referenceFacts = selectedFact
      ? [selectedFact.fact]
      : [...factBundle.trackFacts, ...factBundle.artistFacts]
          .filter((f) => !isWeakSnippetSeed(f) && !isMetadataOnlyFallbackFact(f))
          .filter((f) => !isCatalogMetadataSeed(f))
          .filter((f) => !factsTooSimilar(f, rejectSimilarTo))
          .sort((a, b) => interestScore(b) - interestScore(a))
          .slice(0, 4);

    if (!selectedFact && referenceFacts.length === 0) {
      const wikiEarly = await pickArtistWikiContent({
        installId,
        artist: metadata.artist,
        previousScripts,
        narrator: storyNarrator,
      });
      if (wikiEarly && acceptWikiArtistSeed(wikiEarly.text, artistTier, metadata.artist)) {
        selectedFact = {
          fact: wikiEarly.text,
          scope: 'artist',
          scopeLabelRu: 'группа/артист',
          interestScore: interestScore(wikiEarly.text),
          interestRating: interestRating10(wikiEarly.text),
        };
        referenceFacts = [wikiEarly.text];
        console.log(
          `[facts] wiki early seed for "${metadata.artist}" chars=${wikiEarly.text.length}`,
        );
      }
    }

    if (!selectedFact) {
      const trackPool = factBundle.trackFacts;
      const validatedPool = [...factBundle.trackFacts, ...factBundle.artistFacts]
        .filter(
          (fact) =>
            !isRejectedStorySeed(
              fact,
              metadata.artist,
              metadata.title,
              trackPool,
              storyLang,
            ) &&
            !factsTooSimilar(fact, rejectSimilarTo),
        )
        .sort((a, b) => interestScore(b) - interestScore(a));
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

    if (!selectedFact && countGroundedFacts(factBundle) === 0 && artistTier !== 'major') {
      console.log(
        `[facts] indie artist-only retry for "${metadata.artist}" — "${metadata.title}" tier=${artistTier}`,
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
          storyNarrator,
          factPickCtx,
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

    if (
      !selectedFact &&
      referenceFacts.filter((f) => !isMetadataOnlyFallbackFact(f) && !isWeakSnippetSeed(f)).length === 0
    ) {
      const wikiSalvage = await pickArtistWikiContent({
        installId,
        artist: metadata.artist,
        previousScripts,
        narrator: storyNarrator,
      });
      if (wikiSalvage && acceptWikiArtistSeed(wikiSalvage.text, artistTier, metadata.artist)) {
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
        const snippetSeed =
          pickSalvageSnippetSeed(factCtx.rawSnippets, metadata.artist, metadata.title, storyLang) ??
          pickRelaxedSnippetSeed(factCtx.rawSnippets, metadata.artist, metadata.title, storyLang);
        if (snippetSeed) {
          selectedFact = snippetSeed;
          referenceFacts = [snippetSeed.fact];
          console.log(
            `[facts] search-snippet salvage for "${metadata.artist}" — "${metadata.title}"`,
          );
        } else {
        const emergencyCtx = await fetchEmergencyFactRescue(
          metadata.artist,
          metadata.title,
          factCtx.rawSnippets,
        );
        factCtx = {
          ...factCtx,
          bundle: emergencyCtx.bundle,
          rawSnippets: [...new Set([...factCtx.rawSnippets, ...emergencyCtx.rawSnippets])],
        };
        factBundle = emergencyCtx.bundle;
        trackFactCount = factBundle.trackFacts.length;
        artistFactCount = factBundle.artistFacts.length;
        if (trackFactCount + artistFactCount > 0) {
          ingestBundleToBank(metadata.artist, metadata.title, factBundle);
          selectedFact = await pickFactForUser(
            installId,
            factBundle,
            metadata.artist,
            metadata.title,
            previousScripts.length,
            storyNarrator,
            factPickCtx,
          );
          if (selectedFact) {
            referenceFacts = [selectedFact.fact];
            console.log(formatFactPickLog(selectedFact, 'rules') + ' (emergency-rescue)');
          }
        }
        if (!selectedFact) {
          const snippetSeed =
            pickSalvageSnippetSeed(factCtx.rawSnippets, metadata.artist, metadata.title, storyLang) ??
            pickRelaxedSnippetSeed(factCtx.rawSnippets, metadata.artist, metadata.title, storyLang);
          if (snippetSeed) {
            selectedFact = snippetSeed;
            referenceFacts = [snippetSeed.fact];
            console.log(
              `[facts] emergency snippet salvage for "${metadata.artist}" — "${metadata.title}"`,
            );
          }
        }
        if (!selectedFact) {
          if (isCatalogMajorArtist(metadata.artist)) {
            const factModels =
              ownLlmKey && openrouterModelFact.includes('/')
                ? [openrouterModelFact]
                : resolveOpenRouterFactModelsForTier(userTier, openrouterModelRequested);
            console.log(
              `[fact-hunt-catalog] start artist="${metadata.artist}" title="${metadata.title}" models=${factModels.join(' → ')}`,
            );
            const catalogFact = await huntMajorArtistCatalogFact({
              artist: metadata.artist,
              title: metadata.title,
              year: metadata.year,
              genre: metadata.genre,
              preferredProvider: llmProvider,
              openRouterModel: openrouterModelFact,
              openRouterModels: factModels,
            });
            if (catalogFact) {
              selectedFact = catalogFact;
              referenceFacts = [catalogFact.fact];
              ingestFacts(metadata.artist, metadata.title, [
                { fact: catalogFact.fact, scope: catalogFact.scope, source: 'llm' },
              ]);
              console.log(formatFactPickLog(selectedFact, 'llm') + ' (major-catalog)');
            }
          }
        }
        if (!selectedFact) {
          const wikiLastResort = await tryRetryArtistWikiSeed({
            installId,
            artist: metadata.artist,
            previousScripts,
            narrator: storyNarrator,
          });
          if (wikiLastResort && acceptWikiArtistSeed(wikiLastResort.text, artistTier, metadata.artist)) {
            selectedFact = {
              fact: wikiLastResort.text,
              scope: 'artist',
              scopeLabelRu: 'группа/артист',
              interestScore: interestScore(wikiLastResort.text),
              interestRating: interestRating10(wikiLastResort.text),
            };
            referenceFacts = [wikiLastResort.text];
            console.log(
              `[facts] wiki last-resort seed for "${metadata.artist}" chars=${wikiLastResort.text.length} tier=${artistTier}`,
            );
          }
        }
        if (!selectedFact) {
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
      }
    }

    const finalReferenceFacts = selectedFact ? [selectedFact.fact] : referenceFacts;

    const coverSituation = assessCoverSituation(
      artist,
      title,
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

    let storyReferenceFacts =
      coverSituation.action === 'pivot_artist'
        ? coverSituation.referenceFacts.filter((f) => !isCatalogMetadataSeed(f))
        : selectedFact
          ? [selectedFact.fact]
          : finalReferenceFacts.filter((f) => !isCatalogMetadataSeed(f));

    if (storyReferenceFacts.length === 0 && !selectedFact) {
      recordFactMiss({
        installId,
        artist: metadata.artist,
        title: metadata.title,
        reason: 'metadata_only_no_seed',
        artistTier,
      });
      throw new NoReferenceFactsError(metadata.artist, metadata.title);
    }

    if (coverCtx.isCover && coverCtx.coverNoteRu) {
      storyReferenceFacts = [coverCtx.coverNoteRu, ...storyReferenceFacts];
    }

    if (selectedFact?.fact && factsTooSimilar(selectedFact.fact, rejectSimilarTo)) {
      console.warn(
        `[facts] reject consecutive similar seed for "${metadata.title}": "${selectedFact.fact.slice(0, 90)}"`,
      );
      const rejectedFp = factFingerprint(selectedFact.fact);
      usedFingerprints.add(rejectedFp);
      selectedFact = null;
      storyReferenceFacts = storyReferenceFacts.filter((f) => !factsTooSimilar(f, rejectSimilarTo));

      let alt = await pickFactForUser(
        installId,
        factBundle,
        metadata.artist,
        metadata.title,
        previousScripts.length + 1,
        storyNarrator,
        factPickCtx,
      );
      let altFromCatalog = false;

      if (!alt || factsTooSimilar(alt.fact, rejectSimilarTo)) {
        const extraTrack = await fetchFastTrackWikiFacts(metadata.artist, metadata.title);
        const artistLead = await fetchArtistWikiLead(metadata.artist);
        const supplemental = [
          ...extraTrack,
          ...(artistLead?.text?.trim() ? [artistLead.text.trim().slice(0, 480)] : []),
        ].filter(
          (f) =>
            !factsTooSimilar(f, rejectSimilarTo) &&
            factFingerprint(f) !== rejectedFp &&
            interestScore(f) >= 5,
        );
        if (supplemental.length > 0) {
          factBundle = {
            trackFacts: [...new Set([...factBundle.trackFacts, ...supplemental])],
            artistFacts: factBundle.artistFacts,
          };
          trackFactCount = factBundle.trackFacts.length;
          ingestBundleToBank(factArtist, factTitle, factBundle);
          console.log(
            `[facts] supplemental pool +${supplemental.length} after duplicate reject "${metadata.title}"`,
          );
          alt = await pickFactForUser(
            installId,
            factBundle,
            metadata.artist,
            metadata.title,
            previousScripts.length + 2,
            storyNarrator,
            factPickCtx,
          );
        }
      }

      if ((!alt || factsTooSimilar(alt.fact, rejectSimilarTo)) && isCatalogMajorArtist(metadata.artist)) {
        const factModels =
          ownLlmKey && openrouterModelFact.includes('/')
            ? [openrouterModelFact]
            : resolveOpenRouterFactModelsForTier(userTier, openrouterModelRequested);
        const catalogAlt = await huntMajorArtistCatalogFact({
          artist: metadata.artist,
          title: metadata.title,
          year: metadata.year,
          genre: metadata.genre,
          preferredProvider: llmProvider,
          openRouterModel: openrouterModelFact,
          openRouterModels: factModels,
        });
        if (catalogAlt && !factsTooSimilar(catalogAlt.fact, rejectSimilarTo)) {
          alt = catalogAlt;
          altFromCatalog = true;
        }
      }

      if (alt && !factsTooSimilar(alt.fact, rejectSimilarTo)) {
        selectedFact = alt;
        factFromBank = false;
        factHuntLlm = altFromCatalog;
        storyReferenceFacts = [selectedFact.fact];
        if (coverCtx.isCover && coverCtx.coverNoteRu) {
          storyReferenceFacts = [coverCtx.coverNoteRu, ...storyReferenceFacts];
        }
        console.log(`[facts] switched to alternate seed: "${alt.fact.slice(0, 90)}"`);
      } else {
        console.warn(
          `[facts] no alternate seed after duplicate reject for "${metadata.artist}" — "${metadata.title}"`,
        );
      }
    }

    if (selectedFact?.fact) {
      await reserveSeedForUser(installId, metadata.artist, metadata.title, selectedFact, trackAlbum);
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
      storyLanguage: storyLanguage ?? 'ru',
      speakTrackNamesInVoiceover: body.speak_track_names_in_voiceover === true,
    };

    if (selectedFact?.fact) {
      const seedSource: 'curated' | 'bank' | 'llm-hunt' | 'online-pick' | 'web-salvage' = factFromCurated
        ? 'curated'
        : factFromBank
          ? 'bank'
          : factHuntLlm
            ? 'llm-hunt'
            : factFromSalvage
              ? 'web-salvage'
              : 'online-pick';
      const topic = classifyFactTopic(selectedFact.fact);
      console.log(
        formatFactPickLog(selectedFact, seedSource) +
          ` track="${metadata.title}" artist="${metadata.artist}" topic=${topic} (${FACT_TOPIC_LABELS_RU[topic]})`,
      );
      console.log(`[story-seed-why] ${selectedFactWhy}`);
    }
    timing.mark(
      'seed-ready',
      selectedFact
        ? `scope=${selectedFact.scope} score=${selectedFact.interestScore} rating=${selectedFact.interestRating}/10`
        : 'no-seed',
    );

    if (selectedFact?.fact) {
      console.log('[story-pipeline] seed-fact-begin');
      console.log(selectedFact.fact.slice(0, 500));
      console.log('[story-pipeline] seed-fact-end');
    } else if (storyReferenceFacts.length > 0) {
      const preview = storyReferenceFacts
        .filter((f) => !isMetadataOnlyFallbackFact(f))
        .map((f) => f.slice(0, 200))
        .join(' | ');
      console.log(
        `[story-pipeline] no selected seed; referenceFacts=${storyReferenceFacts.length} preview="${preview.slice(0, 240)}"`,
      );
    } else {
      console.log('[story-pipeline] no seed and no reference facts before story LLM');
    }

    throwIfStoryAborted(clientAbort, 'seed-ready');

    const { story, llmUsed } = await (async () => {
      const hasGroundedSeed = Boolean(selectedFact?.fact && selectedFact.interestScore >= 6 && !isWeakSelectedFact(selectedFact, metadata.artist, metadata.title));
      let effectiveStoryInput = storyInput;

      if (!hasGroundedSeed && !factFromBank) {
        if (selectedFact && isWeakSelectedFact(selectedFact, metadata.artist, metadata.title)) {
          console.warn(
            `[story-pipeline] weak seed rejected score=${selectedFact.interestScore} fact="${selectedFact.fact.slice(0, 100)}"`,
          );
        }
        const strongBundleFacts = [...factBundle.trackFacts, ...factBundle.artistFacts]
          .filter((f) => interestScore(f) >= 6 && !isWeakSnippetSeed(f))
          .sort((a, b) => interestScore(b) - interestScore(a));
        const realRefFacts = storyReferenceFacts.filter(
          (f) => !isMetadataOnlyFallbackFact(f) && !isWeakSnippetSeed(f),
        );

        if (strongBundleFacts.length > 0) {
          const best = strongBundleFacts[0]!;
          effectiveStoryInput = {
            ...storyInput,
            referenceFacts: [best],
            selectedReferenceFact: {
              fact: best,
              scope: factBundle.trackFacts.includes(best) ? 'track' : 'artist',
              scopeLabelRu: factBundle.trackFacts.includes(best) ? 'трек' : 'группа/артист',
              interestScore: interestScore(best),
              interestRating: interestRating10(best),
            },
            rawSnippets: undefined,
          };
          console.log(
            `[story-pipeline] strong bundle fact score=${interestScore(best)} fact="${best.slice(0, 120)}"`,
          );
        } else if (realRefFacts.length > 0) {
          const best = realRefFacts.sort((a, b) => interestScore(b) - interestScore(a))[0]!;
          effectiveStoryInput = {
            ...storyInput,
            referenceFacts: [best],
            selectedReferenceFact: {
              fact: best,
              scope: 'artist',
              scopeLabelRu: 'группа/артист',
              interestScore: interestScore(best),
              interestRating: interestRating10(best),
            },
            rawSnippets: undefined,
          };
          console.log(
            `[story-pipeline] use salvaged reference fact score=${interestScore(best)} fact="${best.slice(0, 120)}"`,
          );
        } else {
        const wikiLeadRaw = await tryRetryArtistWikiSeed({
          installId,
          artist: metadata.artist,
          previousScripts,
          narrator: storyNarrator,
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
            `[indie-wiki] no wiki lead for "${primaryArtistName(metadata.artist)}" — trying snippet salvage`,
          );
          const snippetFirst = pickSalvageSnippetSeed(
            factCtx.rawSnippets,
            metadata.artist,
            metadata.title,
            storyLang,
          );
          if (snippetFirst) {
            effectiveStoryInput = {
              ...storyInput,
              referenceFacts: [snippetFirst.fact],
              selectedReferenceFact: snippetFirst,
              rawSnippets: undefined,
            };
            console.log(
              `[story-pipeline] snippet salvage after wiki miss scope=${snippetFirst.scope} fact="${snippetFirst.fact.slice(0, 120)}"`,
            );
          } else {
            const onlyPlaceholder =
              storyReferenceFacts.length === 0 ||
              storyReferenceFacts.every(isMetadataOnlyFallbackFact);
            if (onlyPlaceholder) {
              throw new NoReferenceFactsError(metadata.artist, metadata.title);
            }
          }
        }
        if (wikiLead) {
          console.log(
            `[indie-wiki] lead lang=${wikiLead.lang} chars=${wikiLead.text.length} artist="${primaryArtistName(metadata.artist)}"`,
          );
          const skipWikiTranslate =
            artistTier === 'major' ||
            isWikiBiographyLead(wikiLead.text) ||
            Boolean(curatedHit);
          if (skipWikiTranslate) {
            console.log(
              `[indie-wiki] skip verbatim translate tier=${artistTier} bio=${isWikiBiographyLead(wikiLead.text)} curated=${Boolean(curatedHit)}`,
            );
          } else {
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
            if (wikiScriptFinal && countWords(wikiScriptFinal) >= 35) {
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
          }
          const llmSeedFact = curatedHit?.fact
            ?? (isWikiBiographyLead(wikiLead.text) && artistTier !== 'major' ? null : wikiLead.text);
          const llmReferenceFacts = llmSeedFact
            ? [
                llmSeedFact,
                ...storyReferenceFacts.filter(
                  (f) => !isMetadataOnlyFallbackFact(f) && !isWikiBiographyLead(f),
                ),
              ].slice(0, 4)
            : storyReferenceFacts.filter(
                (f) => !isMetadataOnlyFallbackFact(f) && !isWikiBiographyLead(f),
              ).slice(0, 4);
          if (llmReferenceFacts.length > 0) {
            const primary = llmReferenceFacts[0]!;
            effectiveStoryInput = {
              ...storyInput,
              referenceFacts: llmReferenceFacts,
              selectedReferenceFact: {
                fact: primary,
                scope: curatedHit?.scope ?? 'artist',
                scopeLabelRu: curatedHit?.scope === 'track' ? 'трек' : 'группа/артист',
                interestScore: interestScore(primary),
                interestRating: interestRating10(primary),
              },
              rawSnippets: undefined,
            };
          }
        }
        }
      }

      const refFacts = effectiveStoryInput.referenceFacts ?? [];
      const groundedSeed = effectiveStoryInput.selectedReferenceFact?.fact?.trim() ?? '';
      const seedScore = effectiveStoryInput.selectedReferenceFact?.interestScore ?? 0;
      const hasRealSeed =
        groundedSeed.length > 0 &&
        seedScore >= 6 &&
        !isMetadataOnlyFallbackFact(groundedSeed) &&
        !isWeakSnippetSeed(groundedSeed, seedScore);
      if (
        !factFromBank &&
        !hasRealSeed &&
        (refFacts.length === 0 || refFacts.every(isMetadataOnlyFallbackFact))
      ) {
        const snippetSeed =
          pickSalvageSnippetSeed(factCtx.rawSnippets, metadata.artist, metadata.title, storyLang) ??
          pickRelaxedSnippetSeed(factCtx.rawSnippets, metadata.artist, metadata.title, storyLang);
        if (snippetSeed) {
          effectiveStoryInput = {
            ...effectiveStoryInput,
            referenceFacts: [snippetSeed.fact],
            selectedReferenceFact: snippetSeed,
          };
          console.log(
            `[facts] late search-snippet salvage for "${metadata.artist}" — "${metadata.title}"`,
          );
        } else {
          const wikiLate = await tryRetryArtistWikiSeed({
            installId,
            artist: metadata.artist,
            previousScripts,
            narrator: storyNarrator,
          });
          if (wikiLate && acceptWikiArtistSeed(wikiLate.text, artistTier, metadata.artist)) {
            effectiveStoryInput = {
              ...effectiveStoryInput,
              referenceFacts: [wikiLate.text],
              selectedReferenceFact: {
                fact: wikiLate.text,
                scope: 'artist',
                scopeLabelRu: 'группа/артист',
                interestScore: interestScore(wikiLate.text),
                interestRating: interestRating10(wikiLate.text),
              },
            };
            console.log(
              `[facts] wiki late-resort seed for "${metadata.artist}" chars=${wikiLate.text.length} tier=${artistTier}`,
            );
          } else {
        throw new NoReferenceFactsError(metadata.artist, metadata.title);
          }
        }
      }

      return generateStoryWithFallback(effectiveStoryInput, llmProvider, {
        serverManaged: userTier === 'free' && !ownLlmKey,
      });
    })();

    throwIfStoryAborted(clientAbort, 'story-text');
    timing.mark('story-text', `llm=${llmUsed} words=${story.word_count}`);

    const narratorPreset = getNarratorPreset(storyNarrator);
    console.log(
      `[story-llm] narrator=${storyNarrator}${narratorPreset ? ` persona="${narratorPreset.labelRu}"` : ''}`,
    );

    console.log(
      `[story-script] ${metadata.artist} — ${metadata.title} | llm=${llmUsed} | narrator=${storyNarrator} | words=${story.word_count}`,
    );
    console.log('[story-script-begin]');
    console.log(story.script);
    console.log('[story-script-end]');

    const displayScript = story.script;

    const effectiveVoiceTier: VoiceTier =
      hasUserTtsCredentials(userTtsCredentials)
        ? voiceTier
        : userTier === 'premium' || userTier === 'trial' || userTier === 'unlimited'
          ? 'premium'
          : 'default';

    const effectiveTtsProvider: TtsProviderId = resolveStoryTtsProvider(
      installId,
      ttsProvider,
      userTtsCredentials,
    );

    assertFreeTierTtsAvailable(installId, userTtsCredentials);

    const response: Record<string, unknown> = {
      artist,
      title,
      year: metadata.year ?? null,
      genre: metadata.genre ?? null,
      country: metadata.countryCode ?? null,
      mbid: metadata.mbid ?? null,
      script: displayScript,
      word_count: story.word_count,
      voiceId,
      ttsStyle: delivery.styleId,
      ttsSpeed: delivery.speed,
      ttsEmotion: delivery.emotion,
      voiceTier: effectiveVoiceTier,
      demo: false,
      tier: resolveUserTier(installId),
      quota: shouldSkipDailyStoryQuota({ ownLlmKey, userTtsCredentials })
        ? {
            used: 0,
            limit: 999_999,
            remaining: 999_999,
            resetsAt: Date.now() + DAY_MS,
            tier: userTier,
          }
        : getDailyStoryQuota(installId, { freeOpenRouterModel: openrouterModelRequested }),
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

    if (body.skip_server_tts) {
      response.audioUrl = null;
      response.audioFile = null;
      response.ttsHint = 'Озвучка на устройстве (skip_server_tts)';
    } else if (canSynthesizeServerTts(userTtsCredentials)) {
      const id = uuidv4();
      console.log(
        `[tts] queue install=${installId.slice(0, 8)} voice=${voiceId} style=${delivery.styleId} speed=${delivery.speed} emotion=${delivery.emotion} tier=${effectiveVoiceTier} userTier=${userTier} provider=${effectiveTtsProvider} userBilling=${hasUserTtsCredentials(userTtsCredentials) ? userTtsCredentials?.provider : 'server'} words=${story.word_count}`,
      );
      const mobileWav = requiresMobileWavPlayback(body);
      const audio = await synthesizeStoryAudio({
        installId,
        voiceTier: effectiveVoiceTier,
        ttsProvider: effectiveTtsProvider,
        script: story.script,
        voiceId,
        fileName: `${id}.${storyAudioExtensionForClient(body)}`,
        preferMobileWav: mobileWav,
        preferIosPlayback: mobileWav,
        speed: delivery.speed,
        emotion: delivery.emotion,
        pauseProfile: storyLength === 'unlimited' ? delivery.pauseProfile : 'natural',
        ttsStyle: delivery.styleId,
        storyNarrator,
        artist: metadata.artist,
        title: metadata.title,
        edgeVoicePreset: (req.body as StoryFullBody).edge_voice_preset,
        speakTrackNamesInVoiceover: (req.body as StoryFullBody).speak_track_names_in_voiceover,
        storyLanguage: storyLanguage ?? 'ru',
        elevenLabsVoice: ttsVoice,
        logContext: {
          installId,
          artist: metadata.artist,
          title: metadata.title,
        },
        userTtsCredentials,
      });
      response.audioUrl = signAudioAccess(audio.fileName) ?? audio.audioUrl;
      response.audioFile = audio.fileName;
      response.ttsProvider = audio.provider;
      if (audio.ttsTranscript) {
        const speakNames = (req.body as StoryFullBody).speak_track_names_in_voiceover === true;
        response.tts_transcript = formatUserFacingTranscript(
          audio.ttsTranscript,
          speakNames ? story.script : undefined,
        );
      }
    } else {
      response.audioUrl = null;
      response.audioFile = null;
      response.ttsHint =
        'TTS не настроен: Edge, YANDEX_API_KEY или Azure premium';
    }

    timing.mark('tts-ready', `audio=${Boolean(response.audioUrl)}`);

    recordStoryGeneration(installId, req, {
      freeOpenRouterModel: openrouterModelRequested,
      skipDailyQuota: shouldSkipDailyStoryQuota({ ownLlmKey: ownLlmKey, userTtsCredentials }),
    });
    if (selectedFact?.fact) {
      response.seed_fact = selectedFact.fact;
      response.seed_scope = selectedFact.scope;
      response.seed_interest_score = selectedFact.interestScore;
      response.seed_interest_rating = selectedFact.interestRating;
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
    if (err instanceof StoryRequestAbortedError) {
      console.log(
        `[story] cancelled install=${installId.slice(0, 8)} artist="${artist}" title="${title}" reason=${err.reason}`,
      );
      if (!res.headersSent) {
        res.status(499).json({ ok: false, cancelled: true, reason: err.reason });
      }
      return;
    }
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
    if (err instanceof SpeechKitSubscriptionRequiredError || err instanceof FreeTierEdgeTtsError) {
      res.status(402).json({
        error: err.message,
        code: err.code,
        message: err.message,
        source: 'billing',
      });
      return;
    }

    await rollbackReservedSeed(installId, artist, title);

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
  } finally {
    releaseStoryGeneration(installId, clientAbort);
  }
});

router.post('/complete', async (req: Request, res: Response) => {
  const installId = req.installId!;
  const artist = typeof req.body?.artist === 'string' ? req.body.artist.trim() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const script = typeof req.body?.script === 'string' ? req.body.script.trim() : '';
  const seedFact = typeof req.body?.seed_fact === 'string' ? req.body.seed_fact.trim() : '';
  const seedScopeRaw = typeof req.body?.seed_scope === 'string' ? req.body.seed_scope.trim() : 'track';
  const storyNarratorRaw =
    typeof req.body?.story_narrator === 'string' ? req.body.story_narrator.trim() : 'auto';

  if (!artist || !title || !script || !seedFact) {
    res.status(400).json({ error: 'artist, title, script and seed_fact required' });
    return;
  }

  const scope =
    seedScopeRaw === 'artist' || seedScopeRaw === 'album' || seedScopeRaw === 'track'
      ? seedScopeRaw
      : 'track';
  const interestScore =
    typeof req.body?.seed_interest_score === 'number' ? req.body.seed_interest_score : 10;
  const interestRating =
    typeof req.body?.seed_interest_rating === 'number' ? req.body.seed_interest_rating : 6;
  const storyNarrator = (storyNarratorRaw || 'auto') as StoryNarratorId;

  try {
    await recordUserStory(installId, {
      artist,
      title,
      script,
      seed: {
        fact: seedFact,
        scope,
        scopeLabelRu:
          scope === 'artist' ? 'группа/артист' : scope === 'album' ? 'альбом' : 'трек',
        interestScore,
        interestRating,
      },
      storyNarrator,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(
      `[story/complete] fail install=${installId.slice(0, 8)} artist="${artist}" title="${title}"`,
      err,
    );
    res.status(500).json({ error: 'Failed to record completed story' });
  }
});

router.post('/feedback', (req: Request, res: Response) => {
  const installId = req.installId!;
  const artist = typeof req.body?.artist === 'string' ? req.body.artist.trim() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const voteRaw = typeof req.body?.vote === 'string' ? req.body.vote.trim().toLowerCase() : '';
  const script = typeof req.body?.script === 'string' ? req.body.script.trim() : undefined;
  const storyNarratorRaw =
    typeof req.body?.story_narrator === 'string' ? req.body.story_narrator.trim() : undefined;
  const seedFact =
    typeof req.body?.seed_fact === 'string' ? req.body.seed_fact.trim() : undefined;
  const genre = typeof req.body?.genre === 'string' ? req.body.genre.trim() : undefined;
  const yearRaw = req.body?.year;
  const year =
    typeof yearRaw === 'number' && Number.isFinite(yearRaw)
      ? yearRaw
      : typeof yearRaw === 'string' && yearRaw.trim()
        ? parseInt(yearRaw, 10)
        : undefined;
  const langRaw = typeof req.body?.lang === 'string' ? req.body.lang.trim().toLowerCase() : undefined;
  const lang = langRaw === 'en' || langRaw === 'ru' ? langRaw : undefined;

  if (!artist || !title) {
    res.status(400).json({ error: 'artist and title required' });
    return;
  }
  if (voteRaw !== 'like' && voteRaw !== 'dislike') {
    res.status(400).json({ error: 'vote must be like or dislike' });
    return;
  }
  const vote = voteRaw as FeedbackVote;
  const historyId =
    typeof req.body?.historyId === 'string' ? req.body.historyId.trim() : undefined;

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
    recordStoryFeedback({
      installId,
      artist,
      title,
      vote,
      reason,
      script,
      storyNarrator: storyNarratorRaw,
      seedFact,
      genre,
      year: Number.isFinite(year) ? year : undefined,
      lang,
    }).id,
  );
  if (historyId) {
    void updateHistoryVoteAsync(installId, historyId, vote).catch((err) =>
      console.warn(
        '[feedback] history vote update failed:',
        err instanceof Error ? err.message : err,
      ),
    );
  }
  res.json({ ok: true, ids, count: ids.length });
});

export default router;
