package com.musicstory.app.data.repository

import android.os.Build
import com.musicstory.app.data.local.CachedStory
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.local.StoryDao
import com.musicstory.app.data.local.StoryHistoryDao
import com.musicstory.app.data.local.StoryHistoryEntry
import com.musicstory.app.data.model.StoryRequest
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.data.remote.AccountSyncManager
import com.musicstory.app.data.remote.ApiClient
import com.musicstory.app.data.remote.ConnectionCheckResult
import com.musicstory.app.data.remote.ConnectionChecker
import com.musicstory.app.data.remote.MetadataCache
import com.musicstory.app.data.remote.GroqErrorParser
import com.musicstory.app.data.remote.ServerRateLimitParser
import com.musicstory.app.data.model.StoryQuotaInfo
import com.google.gson.Gson
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.GroqModel
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.domain.OpenRouterModel
import com.musicstory.app.domain.TierAccess
import com.musicstory.app.domain.ReferenceFactPicker
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.StoryPersona
import com.musicstory.app.domain.StoryScriptQuality
import com.musicstory.app.domain.UserTtsBilling
import com.musicstory.app.domain.TtsEmotion
import com.musicstory.app.domain.TtsSpeed
import com.musicstory.app.domain.TtsVoice
import com.musicstory.app.util.StoryLog
import com.musicstory.app.util.ApiKeySanitizer
import com.musicstory.app.util.BackendUrlRules
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import retrofit2.HttpException
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.UUID

class StoryRepository(
    private val storyDao: StoryDao,
    private val storyHistoryDao: StoryHistoryDao,
    private val settingsDataStore: SettingsDataStore,
    private val apiClient: ApiClient,
    private val accountSyncManager: AccountSyncManager? = null,
    private val metadataCache: MetadataCache,
    private val connectionChecker: ConnectionChecker = ConnectionChecker(),
) {
    private val gson = Gson()
    private val storyFetchMutex = Mutex()

    private val _dailyQuota = MutableStateFlow<StoryQuotaInfo?>(null)
    val dailyQuota: StateFlow<StoryQuotaInfo?> = _dailyQuota.asStateFlow()

    val storyHistory: Flow<List<StoryHistoryEntry>> = storyHistoryDao.observeAll()

    fun cancelActiveStoryFetch(reason: String = "unknown") {
        apiClient.cancelActiveStoryRequest(reason)
    }

    suspend fun mergeHistoryFromServer(baseUrl: String) {
        val sync = accountSyncManager ?: return
        val remote = sync.pullHistory(baseUrl.trim()) ?: return
        for (entry in remote) {
            val serverId = entry.serverId?.takeIf { it.isNotBlank() }
            if (serverId != null) {
                val existing = storyHistoryDao.findByServerId(serverId)
                if (existing != null) {
                    val remoteVote = entry.vote?.takeIf { it.isNotBlank() }
                    if (remoteVote != null && existing.vote != remoteVote) {
                        storyHistoryDao.updateVote(existing.id, remoteVote)
                    }
                    continue
                }
                if (storyHistoryDao.countByServerId(serverId) == 0) {
                    storyHistoryDao.insert(entry)
                }
                continue
            }
            if (storyHistoryDao.countByTrackAndTime(entry.trackKey, entry.playedAt) == 0) {
                storyHistoryDao.insert(entry)
            }
        }
    }

    /** Pull cloud data down, then push local entries up (login / cold start). */
    suspend fun syncAccountDataWithServer(baseUrl: String) {
        mergeHistoryFromServer(baseUrl)
        pushAllLocalHistoryToServer(baseUrl)
    }

    suspend fun findLatestVoteForTrack(trackKey: String): String? =
        storyHistoryDao.findLatestVoteForTrack(trackKey)

    suspend fun hasVoteForStory(trackKey: String, script: String): Boolean =
        storyHistoryDao.findVoteForTrackAndScript(trackKey, script) != null

    private suspend fun pushAllLocalHistoryToServer(baseUrl: String) {
        val sync = accountSyncManager ?: return
        val url = baseUrl.trim()
        if (url.isBlank()) return
        val syncCode = settingsDataStore.syncCode.first()
        for (entry in storyHistoryDao.getAllRecent()) {
            sync.pushHistoryEntry(
                baseUrl = url,
                entry = entry,
                localSyncCode = syncCode,
                onSyncCodeUpdated = { settingsDataStore.setSyncCode(it) },
            )
        }
    }

    /** Send feedback and persist vote locally + in cloud history when linked. */
    suspend fun submitStoryFeedback(
        entry: StoryHistoryEntry,
        vote: String,
        reasons: List<String>,
    ): Boolean {
        if (reasons.isEmpty()) return false
        val url = settingsDataStore.backendUrl.first().trim()
        if (url.isBlank()) return false

        var serverId = entry.serverId
        if (serverId.isNullOrBlank()) {
            serverId = UUID.randomUUID().toString()
            storyHistoryDao.updateServerId(entry.id, serverId)
        }

        val ok = apiClient.submitStoryFeedback(
            baseUrl = url,
            artist = entry.artist,
            title = entry.title,
            vote = vote,
            reasons = reasons,
            script = entry.script,
            historyId = serverId,
        )
        if (!ok) return false

        storyHistoryDao.updateVote(entry.id, vote)
        scopePushSyncHistory(
            entry.copy(serverId = serverId, vote = vote),
        )
        return true
    }

    suspend fun submitPendingStoryFeedback(
        feedback: com.musicstory.app.domain.PendingStoryFeedback,
        vote: String,
        reasons: List<String>,
    ): Boolean {
        val historyEntry = storyHistoryDao.findLatestByTrackAndScript(feedback.trackKey, feedback.script)
            ?: storyHistoryDao.findLatestByTrackKey(feedback.trackKey)
        if (historyEntry != null) {
            return submitStoryFeedback(historyEntry, vote, reasons)
        }
        val url = settingsDataStore.backendUrl.first().trim()
        if (url.isBlank()) return false
        val ok = apiClient.submitStoryFeedback(
            baseUrl = url,
            artist = feedback.artist,
            title = feedback.title,
            vote = vote,
            reasons = reasons,
            script = feedback.script,
        )
        if (ok) {
            storyHistoryDao.findLatestByTrackAndScript(feedback.trackKey, feedback.script)
                ?.let { storyHistoryDao.updateVote(it.id, vote) }
        }
        return ok
    }

    suspend fun refreshQuota() {
        var backendUrl = settingsDataStore.backendUrl.first().trim()
        if (!shouldTryBackend(backendUrl)) return
        runCatching {
            val quotaResp = apiClient.fetchQuota(backendUrl)
            _dailyQuota.value = quotaResp.quota?.copy(tier = quotaResp.quota.tier ?: quotaResp.tier)
        }.onFailure {
            StoryLog.w("Quota refresh failed: ${it.message}")
        }
    }

    /** User-entered LLM key (OpenRouter/Groq/Gemini/local Ollama) — not Railway URL. */
    suspend fun hasPersonalApiKeyConfigured(): Boolean {
        val provider = settingsDataStore.llmProvider.first()
        if (provider == LlmProvider.LOCAL) {
            return settingsDataStore.localOllamaUrl.first().isNotBlank()
        }
        return apiKeyForProvider(
            provider,
            ApiKeySanitizer.clean(settingsDataStore.groqApiKey.first()),
            ApiKeySanitizer.clean(settingsDataStore.geminiApiKey.first()),
            ApiKeySanitizer.clean(settingsDataStore.openRouterApiKey.first()),
            settingsDataStore.localOllamaUrl.first(),
        ).isNotBlank()
    }

    /** Stories need personal API key or a configured Railway backend (server quota). */
    suspend fun hasOwnApiKeyConfigured(): Boolean {
        if (hasPersonalApiKeyConfigured()) return true
        return settingsDataStore.backendUrl.first().trim().isNotBlank()
    }

    suspend fun checkConnections(
        llmProvider: LlmProvider,
        groqApiKey: String,
        geminiApiKey: String,
        openRouterApiKey: String,
        geminiModel: GeminiModel,
        groqModel: GroqModel,
        groqCustomModelId: String,
        openRouterModel: OpenRouterModel,
        openRouterCustomModelId: String,
        backendUrl: String,
        localOllamaUrl: String = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL,
        localOllamaModel: String = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_MODEL,
    ): ConnectionCheckResult {
        val result = connectionChecker.runFullCheck(
            apiClient,
            backendUrl.trim(),
            llmProvider,
            groqApiKey = ApiKeySanitizer.clean(groqApiKey),
            geminiApiKey = ApiKeySanitizer.clean(geminiApiKey),
            openRouterApiKey = ApiKeySanitizer.clean(openRouterApiKey),
            geminiModel.id,
            groqModel.resolveApiModelId(groqCustomModelId) ?: groqModel.id,
            openRouterModel.resolveApiModelId(openRouterCustomModelId) ?: openRouterModel.id,
            localOllamaUrl = localOllamaUrl.trim(),
            localOllamaModel = localOllamaModel.trim(),
        )
        result.quota?.let { _dailyQuota.value = it }
        return result
    }

    suspend fun fetchStory(track: TrackInfo, forceRefresh: Boolean = true): Result<StoryResponse> =
        storyFetchMutex.withLock {
            fetchStoryLocked(track, forceRefresh)
        }

    private suspend fun fetchStoryLocked(track: TrackInfo, forceRefresh: Boolean): Result<StoryResponse> {
        if (!track.isValid()) {
            return Result.failure(IllegalArgumentException("Некорректные метаданные трека"))
        }

        val trackKey = track.displayKey
        val ttsPlaybackEngine = settingsDataStore.ttsPlaybackEngine.first()
        val previousScripts = (
            storyHistoryDao.getRecentScripts(trackKey) +
                storyHistoryDao.getRecentScriptsForArtist(track.artist)
            )
            .asSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .distinct()
            .take(MAX_PREVIOUS_SCRIPTS)
            .toList()

        if (!forceRefresh && previousScripts.isEmpty()) {
            val cached = storyDao.getByTrackKey(trackKey)
            if (cached != null && !cached.demo && !isCacheExpired(cached) &&
                ((!cached.audioUrl.isNullOrBlank() || ttsPlaybackEngine.skipsServerTts) &&
                    !StoryScriptQuality.isTemplateLike(cached.script, cached.artist, cached.title))
            ) {
                StoryLog.i("Story from cache")
                return Result.success(cached.toResponse())
            }
        }

        var backendUrl = settingsDataStore.backendUrl.first().trim()
        val llmProvider = settingsDataStore.llmProvider.first()
        val groqKey = ApiKeySanitizer.clean(settingsDataStore.groqApiKey.first())
        val geminiKey = ApiKeySanitizer.clean(settingsDataStore.geminiApiKey.first())
        val openRouterKey = ApiKeySanitizer.clean(settingsDataStore.openRouterApiKey.first())
        var localOllamaUrl = settingsDataStore.localOllamaUrl.first()
        val localOllamaModel = settingsDataStore.localOllamaModel.first()
        val groqModel = settingsDataStore.groqModel.first()
        val groqCustomModelId = settingsDataStore.groqCustomModelId.first()
        val openRouterModel = settingsDataStore.openRouterModel.first()
        val openRouterCustomModelId = settingsDataStore.openRouterCustomModelId.first()
        val storyLength = settingsDataStore.storyLength.first()
        val storyNarrator = settingsDataStore.storyNarrator.first()
        val ttsVoice = settingsDataStore.ttsVoice.first()
        val ttsSpeed = settingsDataStore.ttsSpeed.first()
        val ttsEmotion = settingsDataStore.ttsEmotion.first()
        val userTtsBilling = settingsDataStore.userTtsBilling.first()
        val yandexTtsKey = ApiKeySanitizer.clean(settingsDataStore.yandexApiKey.first())
        val yandexFolderId = settingsDataStore.yandexFolderId.first().trim()
        val saluteAuthKey = ApiKeySanitizer.clean(settingsDataStore.saluteAuthKey.first())
        val geminiModel = settingsDataStore.geminiModel.first()
        val narratorTag = storyNarrator.labelRu
        val inferredBackendFromLocal = if (llmProvider == LlmProvider.LOCAL) {
            BackendUrlRules.backendFromMistypedOllamaUrl(localOllamaUrl)
        } else {
            null
        }
        if (inferredBackendFromLocal != null) {
            backendUrl = inferredBackendFromLocal
            localOllamaUrl = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL
            settingsDataStore.setBackendUrl(backendUrl)
            settingsDataStore.setLocalOllamaUrl(localOllamaUrl)
            StoryLog.w("AUTO-FIX local URLs: backend=$backendUrl, ollama=$localOllamaUrl")
        }

        val useBackend = shouldTryBackend(backendUrl)
        coroutineContext.ensureActive()
        var rateLimitHit = false
        var rateLimitQuota: StoryQuotaInfo? = null
        var rateLimitCode: String? = null
        var serverRateLimit = false
        var backendGroqDown = false
        var templateRejected = false
        var backendError: String? = null

        val directApiKey = apiKeyForProvider(llmProvider, groqKey, geminiKey, openRouterKey, localOllamaUrl)
        val tier = _dailyQuota.value?.tier
        val backendOpenRouterModel = resolveBackendOpenRouterModel(
            openRouterModel = openRouterModel,
            openRouterCustomModelId = openRouterCustomModelId,
            hasPersonalKey = directApiKey.isNotBlank(),
            tier = tier,
        )
        val requestOpenRouterModel = resolveStoryOpenRouterModel(
            backendOpenRouterModelId = backendOpenRouterModel,
            openRouterModel = openRouterModel,
            openRouterCustomModelId = openRouterCustomModelId,
            hasPersonalKey = directApiKey.isNotBlank(),
            tier = tier,
        )
        StoryLog.i(
            "fetchStory ${track.artist} — ${track.title}: provider=${llmProvider.id}, " +
                "ownKey=${directApiKey.isNotEmpty()}, backend=$useBackend",
        )

        if (llmProvider == LlmProvider.GEMINI && geminiKey.isEmpty() && !useBackend) {
            return Result.failure(
                IOException(
                    "Выбран Gemini, но API-ключ не сохранён. Вставь ключ в Настройки → AI и нажми «Сохранить».",
                ),
            )
        }
        if (llmProvider == LlmProvider.OPENROUTER && openRouterKey.isEmpty() && !useBackend) {
            return Result.failure(
                IOException(
                    "Выбран OpenRouter, но ключ не сохранён. Добавь OPEN_ROUTER_API_KEY на Railway или свой ключ в настройках.",
                ),
            )
        }
        if (llmProvider == LlmProvider.GROQ && groqKey.isEmpty() && !useBackend) {
            return Result.failure(
                IOException(
                    "Выбран Groq, но API-ключ не сохранён и сервер не настроен.",
                ),
            )
        }
        if (llmProvider == LlmProvider.LOCAL && localOllamaUrl.isBlank()) {
            return Result.failure(
                IOException(
                    "Выбран «Локально», но URL Ollama не задан. Укажи http://127.0.0.1:11435 в настройках.",
                ),
            )
        }
        if (llmProvider == LlmProvider.LOCAL && !BackendUrlRules.isLanBackend(backendUrl)) {
            return Result.failure(IOException(BackendUrlRules.localBackendRequiredMessage(backendUrl)))
        }

        if (!ttsPlaybackEngine.skipsServerTts) {
            when (userTtsBilling) {
                UserTtsBilling.YANDEX -> {
                    if (yandexTtsKey.isBlank() || yandexFolderId.isBlank()) {
                        return Result.failure(
                            IOException(
                                "Выбран свой Yandex SpeechKit, но не указаны API Key и Folder ID в Настройки → Озвучка → Свои ключи.",
                            ),
                        )
                    }
                }
                UserTtsBilling.SBER -> {
                    if (saluteAuthKey.isBlank()) {
                        return Result.failure(
                            IOException(
                                "Выбран SaluteSpeech, но не указан Authorization Key в Настройки → Озвучка → Свои ключи.",
                            ),
                        )
                    }
                }
                UserTtsBilling.SERVER -> Unit
            }
        }

        coroutineContext.ensureActive()

        if (!useBackend) {
            return Result.failure(
                IOException(
                    "Нужен Railway BFF — из РФ нейросети работают только через сервер. Укажи URL в настройках.",
                ),
            )
        }

        // Railway: LLM + Yandex TTS (озвучка только с сервера).
        when (val backendResult = tryBackendStory(
                backendUrl = backendUrl,
                track = track,
                trackKey = trackKey,
                previousScripts = previousScripts,
                narratorTag = narratorTag,
                storyLength = storyLength,
                storyNarrator = storyNarrator,
                ttsVoice = ttsVoice,
                ttsSpeed = ttsSpeed,
                ttsEmotion = ttsEmotion,
                skipServerTts = ttsPlaybackEngine.skipsServerTts,
                llmProvider = llmProvider,
                geminiModel = geminiModel,
                groqModel = groqModel,
                groqCustomModelId = groqCustomModelId,
                openRouterModel = openRouterModel,
                openRouterCustomModelId = openRouterCustomModelId,
                backendOpenRouterModelId = requestOpenRouterModel,
                groqApiKey = groqKey,
                geminiApiKey = geminiKey,
                openRouterApiKey = openRouterKey,
                localOllamaUrl = localOllamaUrl,
                localOllamaModel = localOllamaModel,
                userTtsBilling = userTtsBilling,
                yandexTtsApiKey = yandexTtsKey,
                yandexFolderId = yandexFolderId,
                saluteAuthKey = saluteAuthKey,
            )) {
                is StoryAttemptResult.Success -> return Result.success(backendResult.response)
                is StoryAttemptResult.TemplateRejected -> templateRejected = true
                is StoryAttemptResult.Failed -> {
                    backendError = backendResult.reason
                    if (backendResult.backendGroqDown) backendGroqDown = true
                    if (backendResult.rateLimitHit) {
                        rateLimitHit = true
                        rateLimitQuota = backendResult.rateLimitQuota
                        rateLimitCode = backendResult.rateLimitCode
                        serverRateLimit = backendResult.serverRateLimit
                    }
                }
            }

        val failureMessage = buildGenerationFailureMessage(
            rateLimitHit = rateLimitHit,
            rateLimitQuota = rateLimitQuota,
            rateLimitCode = rateLimitCode,
            serverRateLimit = serverRateLimit,
            backendError = backendError,
            llmKeyPresent = directApiKey.isNotEmpty(),
            llmProvider = llmProvider,
            backendConfigured = useBackend,
            backendGroqDown = backendGroqDown,
            templateRejected = templateRejected,
        )
        StoryLog.w("Story generation failed: $failureMessage")
        return Result.failure(IOException(failureMessage))
    }

    private sealed class StoryAttemptResult {
        data class Success(val response: StoryResponse) : StoryAttemptResult()
        data object TemplateRejected : StoryAttemptResult()
        data class Failed(
            val reason: String,
            val backendGroqDown: Boolean = false,
            val rateLimitHit: Boolean = false,
            val rateLimitQuota: StoryQuotaInfo? = null,
            val rateLimitCode: String? = null,
            val serverRateLimit: Boolean = false,
        ) : StoryAttemptResult()
    }

    private suspend fun tryBackendStory(
        backendUrl: String,
        track: TrackInfo,
        trackKey: String,
        previousScripts: List<String>,
        narratorTag: String,
        storyLength: StoryLength,
        storyNarrator: StoryNarrator,
        ttsVoice: TtsVoice,
        ttsSpeed: TtsSpeed,
        ttsEmotion: TtsEmotion,
        skipServerTts: Boolean = false,
        llmProvider: LlmProvider,
        geminiModel: GeminiModel,
        groqModel: GroqModel,
        groqCustomModelId: String,
        openRouterModel: OpenRouterModel,
        openRouterCustomModelId: String,
        backendOpenRouterModelId: String? = null,
        groqApiKey: String = "",
        geminiApiKey: String = "",
        openRouterApiKey: String = "",
        localOllamaUrl: String = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL,
        localOllamaModel: String = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_MODEL,
        userTtsBilling: UserTtsBilling = UserTtsBilling.SERVER,
        yandexTtsApiKey: String = "",
        yandexFolderId: String = "",
        saluteAuthKey: String = "",
    ): StoryAttemptResult {
        return try {
            StoryLog.i(
                "Fetching story from backend: $backendUrl (llm=${llmProvider.id}, ownKey=${
                    when (llmProvider) {
                        LlmProvider.GROQ -> groqApiKey.isNotBlank()
                        LlmProvider.GEMINI -> geminiApiKey.isNotBlank()
                        LlmProvider.OPENROUTER -> openRouterApiKey.isNotBlank()
                        LlmProvider.LOCAL -> localOllamaUrl.isNotBlank()
                    }
                })",
            )
            val response = withTimeout(
                if (llmProvider == LlmProvider.LOCAL) BACKEND_LOCAL_TIMEOUT_MS else BACKEND_TIMEOUT_MS,
            ) {
                apiClient.fetchFullStory(
                    backendUrl,
                    StoryRequest(
                        artist = track.artist,
                        title = track.title,
                        previousScripts = previousScripts,
                        storyLength = storyLength.id,
                        storyNarrator = storyNarrator.id,
                        ttsVoice = ttsVoice.id,
                        ttsSpeed = ttsSpeed.yandexSpeed,
                        ttsEmotion = ttsEmotion.id,
                        llmProvider = llmProvider.id,
                        geminiModel = geminiModel.id,
                        groqModel = groqModel.resolveApiModelId(groqCustomModelId),
                        openRouterModel = backendOpenRouterModelId,
                        groqApiKey = groqApiKey.takeIf { it.isNotBlank() },
                        geminiApiKey = geminiApiKey.takeIf { it.isNotBlank() },
                        openRouterApiKey = openRouterApiKey.takeIf { it.isNotBlank() },
                        localOllamaUrl = localOllamaUrl.takeIf { it.isNotBlank() },
                        localOllamaModel = localOllamaModel.takeIf { it.isNotBlank() },
                        skipServerTts = skipServerTts,
                        ttsProvider = when (userTtsBilling) {
                            UserTtsBilling.YANDEX -> "yandex"
                            UserTtsBilling.SBER -> "sber"
                            UserTtsBilling.SERVER -> null
                        },
                        userTtsProvider = when (userTtsBilling) {
                            UserTtsBilling.SERVER -> null
                            else -> userTtsBilling.id
                        },
                        yandexApiKey = yandexTtsApiKey.takeIf { userTtsBilling == UserTtsBilling.YANDEX && it.isNotBlank() },
                        yandexFolderId = yandexFolderId.takeIf { userTtsBilling == UserTtsBilling.YANDEX && it.isNotBlank() },
                        saluteAuthKey = saluteAuthKey.takeIf { userTtsBilling == UserTtsBilling.SBER && it.isNotBlank() },
                    ),
                )
            }
            when {
                response.demo -> {
                    StoryLog.w("Backend returned template/demo story — rejected")
                    StoryAttemptResult.TemplateRejected
                }
                response.script.isBlank() || isDuplicateScript(response.script, previousScripts) -> {
                    StoryLog.w("Backend response rejected: empty or duplicate")
                    StoryAttemptResult.Failed("Сервер вернул пустой или повторный текст")
                }
                response.audioUrl.isNullOrBlank() && !skipServerTts -> {
                    StoryLog.e("Backend returned story without audioUrl")
                    val ttsHint = when (userTtsBilling) {
                        UserTtsBilling.YANDEX ->
                            "Не удалось озвучить через ваш Yandex SpeechKit. Проверь API Key, Folder ID и баланс в Yandex Cloud."
                        UserTtsBilling.SBER ->
                            "Не удалось озвучить через SaluteSpeech. Проверь Authorization Key и лимит на developers.sber.ru."
                        UserTtsBilling.SERVER ->
                            "Сервер не отдал озвучку. Проверь YANDEX_API_KEY на Railway или укажи свой ключ в настройках."
                    }
                    StoryAttemptResult.Failed(ttsHint)
                }
                else -> {
                    response.quota?.let { quota -> _dailyQuota.value = quota }
                    StoryLog.i(
                        "Backend OK: audio=${!response.audioUrl.isNullOrBlank()} " +
                            "androidTts=$skipServerTts quota=${response.quota?.remaining}/${response.quota?.limit}",
                    )
                    persistStory(trackKey, track, response, narratorTag)
                    StoryAttemptResult.Success(response)
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (e is HttpException && e.code() == 499) {
                throw CancellationException("story cancelled")
            }
            if (e is HttpException && e.code() == 409) {
                StoryLog.i("Backend story already in progress (409) — not retrying")
                throw CancellationException("story in progress")
            }
            if (e is IOException && e.message?.contains("cancel", ignoreCase = true) == true) {
                throw CancellationException("story cancelled")
            }
            if (e is HttpException && e.code() == 400) {
                val rawBody = e.response()?.errorBody()?.string().orEmpty()
                val parsedBody = parseHttpErrorBodyFromRaw(rawBody, llmProvider)
                val code = runCatching {
                    gson.fromJson(rawBody, Map::class.java)["code"] as? String
                }.getOrNull()
                val reason = when (code) {
                    "USER_TTS_CREDENTIALS_INVALID" ->
                        parsedBody ?: "Укажи ключи озвучки в настройках приложения."
                    else -> parsedBody ?: "Неверный запрос к серверу (400)."
                }
                StoryLog.w("Backend rejected request (400) code=$code")
                return StoryAttemptResult.Failed(reason)
            }
            if (e is HttpException && e.code() == 429) {
                val parsed = parseServerRateLimit(e)
                parsed.quota?.let { _dailyQuota.value = it }
                StoryLog.w(
                    "Backend rate limit code=${parsed.code} server=${parsed.isServerSource} " +
                        "quota=${parsed.quota?.used}/${parsed.quota?.limit}",
                )
                return StoryAttemptResult.Failed(
                    reason = parsed.message,
                    rateLimitHit = true,
                    rateLimitQuota = parsed.quota,
                    rateLimitCode = parsed.code,
                    serverRateLimit = parsed.isServerSource,
                )
            }
            if (e is HttpException && (e.code() == 503 || e.code() == 500)) {
                val rawBody = e.response()?.errorBody()?.string().orEmpty()
                val parsedBody = parseHttpErrorBodyFromRaw(rawBody, llmProvider)
                val code = runCatching {
                    gson.fromJson(rawBody, Map::class.java)["code"] as? String
                }.getOrNull()
                if (
                    code == "NO_REFERENCE_FACTS" ||
                    code == "COVER_AMBIGUOUS" ||
                    code == "STORY_QUALITY_REJECTED" ||
                    code == "YANDEX_TTS_FAILED" ||
                    code == "YANDEX_TTS_SPEED" ||
                    parsedBody?.contains("не получилось") == true ||
                    parsedBody?.contains("кавер") == true ||
                    parsedBody?.contains("Yandex", ignoreCase = true) == true ||
                    parsedBody?.contains("озвуч", ignoreCase = true) == true
                ) {
                    return StoryAttemptResult.Failed(
                        reason = parsedBody
                            ?: "Извините, по такому треку или группе рассказать историю не получилось.",
                    )
                }
                if (e.code() == 503) {
                    val reason = sanitizeBackendError(parsedBody, llmProvider)
                        ?: explainError(e, llmProvider)
                    StoryLog.w("Backend LLM unavailable: $reason")
                    return StoryAttemptResult.Failed(
                        reason = reason,
                        backendGroqDown = code in LLM_NOT_CONFIGURED_CODES,
                    )
                }
            }
            val reason = sanitizeBackendError(
                (e as? HttpException)?.let { parseHttpErrorBody(it, llmProvider) },
                llmProvider,
            ) ?: explainError(e, llmProvider)
            StoryLog.e("Backend failed: $reason", e)
            StoryAttemptResult.Failed(reason)
        }
    }

    private fun buildGenerationFailureMessage(
        rateLimitHit: Boolean,
        rateLimitQuota: StoryQuotaInfo?,
        rateLimitCode: String?,
        serverRateLimit: Boolean,
        backendError: String?,
        llmKeyPresent: Boolean,
        llmProvider: LlmProvider,
        backendConfigured: Boolean,
        backendGroqDown: Boolean,
        templateRejected: Boolean,
    ): String {
        val providerLabel = llmProvider.labelRu
        if (templateRejected) {
            return backendError
                ?: "Текст истории не прошёл проверку. Нажми «Рассказать историю» ещё раз."
        }
        if (rateLimitHit && serverRateLimit) {
            return backendError?.trim().orEmpty().ifBlank {
                "Лимит сервера Music Story."
            }
        }
        if (rateLimitHit) {
            return backendError ?: "Лимит запросов."
        }
        if (llmKeyPresent && !backendError.isNullOrBlank()) {
            return backendError
        }
        if (llmKeyPresent) {
            return "$providerLabel не ответил через Railway. Проверь ключ в настройках."
        }
        if (backendConfigured && !backendError.isNullOrBlank()) {
            return backendError
        }
        return if (backendConfigured) {
            "Сервер недоступен. Проверь интернет или добавь $providerLabel-ключ в настройках."
        } else {
            "Укажи URL Railway в настройках."
        }
    }

    /** Модель в POST /v1/story/full: свой ключ — из настроек; free — выбор; подписка — null (сервер). */
    private fun resolveStoryOpenRouterModel(
        backendOpenRouterModelId: String?,
        openRouterModel: OpenRouterModel,
        openRouterCustomModelId: String,
        hasPersonalKey: Boolean,
        tier: String?,
    ): String? {
        if (hasPersonalKey) {
            return openRouterModel.resolveApiModelId(openRouterCustomModelId)
        }
        if (TierAccess.isPremiumLike(tier)) {
            return null
        }
        return backendOpenRouterModelId
            ?: openRouterModel.resolveApiModelId(openRouterCustomModelId)
    }

    private fun resolveBackendOpenRouterModel(
        openRouterModel: OpenRouterModel,
        openRouterCustomModelId: String,
        hasPersonalKey: Boolean,
        tier: String?,
    ): String? {
        if (hasPersonalKey || tier?.lowercase() in setOf("premium", "trial", "unlimited")) {
            return null
        }
        val free = OpenRouterModel.freeServerPresets.find { it == openRouterModel }
            ?: OpenRouterModel.defaultFreeServer
        return free.resolveApiModelId(openRouterCustomModelId)
    }

    private fun parseHttpErrorBody(e: HttpException, llmProvider: LlmProvider): String? {
        val body = e.response()?.errorBody()?.string().orEmpty()
        return parseHttpErrorBodyFromRaw(body, llmProvider)
    }

    private fun parseHttpErrorBodyFromRaw(body: String, llmProvider: LlmProvider): String? {
        if (body.isBlank()) return null
        return runCatching {
            val json = gson.fromJson(body, Map::class.java)
            val message = json["message"] as? String
            val code = json["code"] as? String
            when {
                message.isNullOrBlank() -> null
                llmProvider == LlmProvider.GEMINI && (
                    code == "GROQ_RATE_LIMIT" ||
                        code == "GROQ_FAILED" ||
                        code == "GROQ_NOT_CONFIGURED" ||
                        message.contains("Groq", ignoreCase = true)
                    ) ->
                    "Сервер использовал Groq вместо Gemini. Сохраните Gemini-ключ и нажмите «Сохранить и проверить»."
                GroqErrorParser.isAuthError(message) ->
                    "Неверный API-ключ ${llmProvider.labelRu}. Проверьте ключ в настройках."
                else -> message.take(200)
            }
        }.getOrNull()
    }

    private fun sanitizeBackendError(message: String?, llmProvider: LlmProvider): String? {
        if (message.isNullOrBlank()) return null
        if (llmProvider != LlmProvider.GEMINI) return message
        if (message.contains("Groq", ignoreCase = true)) {
            return "Сервер ответил про Groq, хотя выбран Gemini. Сохраните Gemini-ключ в настройках."
        }
        return message
    }

    private fun explainError(e: Exception, llmProvider: LlmProvider): String = when (e) {
        is SocketTimeoutException -> "Сервер долго отвечает — подожди и попробуй ещё раз"
        is HttpException -> when (e.code()) {
            429 -> "Лимит сервера Music Story (не Gemini)"
            499 -> "Отменено"
            503 -> "${llmProvider.labelRu} на сервере недоступен"
            else -> "HTTP ${e.code()}"
        }
        is IOException -> {
            if (e.message?.contains("cancel", ignoreCase = true) == true) {
                "Отменено"
            } else if (e.message?.contains("timeout", ignoreCase = true) == true) {
                "Сервер долго отвечает — подожди и попробуй ещё раз"
            } else {
                "Нет связи с сервером — проверь интернет"
            }
        }
        else -> e.message?.take(80) ?: e.javaClass.simpleName
    }

    private fun parseServerRateLimit(e: HttpException): ServerRateLimitParser.Parsed {
        val body = e.response()?.errorBody()?.string().orEmpty()
        return ServerRateLimitParser.parse(body)
            ?: ServerRateLimitParser.Parsed(
                message = "Лимит сервера Music Story (429). Это не квота Gemini.",
                code = null,
                quota = null,
                isServerSource = true,
            )
    }

    suspend fun recordStoryPlayed(track: TrackInfo, response: StoryResponse, angle: String?) {
        storyHistoryDao.insert(
            StoryHistoryEntry(
                trackKey = track.displayKey,
                artist = track.artist,
                title = track.title,
                script = response.script,
                angle = angle,
            ),
        )
    }

    suspend fun resolveAudioUrl(audioUrl: String?): String? {
        if (audioUrl.isNullOrBlank()) return null
        val baseUrl = settingsDataStore.backendUrl.first()
        val resolved = apiClient.resolveAudioUrl(baseUrl, audioUrl)
        StoryLog.d("Audio URL: $resolved")
        return resolved
    }

    private suspend fun persistStory(
        trackKey: String,
        track: TrackInfo,
        response: StoryResponse,
        angle: String,
    ) {
        storyDao.insert(
            CachedStory(
                trackKey = trackKey,
                artist = response.artist,
                title = response.title,
                year = response.year,
                genre = response.genre,
                script = response.script,
                audioUrl = response.audioUrl,
                demo = response.demo,
            ),
        )
        val entry = StoryHistoryEntry(
            serverId = UUID.randomUUID().toString(),
            trackKey = trackKey,
            artist = track.artist,
            title = track.title,
            script = response.script,
            angle = angle,
        )
        storyHistoryDao.insert(entry)
        scopePushSyncHistory(entry)
    }

    private fun scopePushSyncHistory(entry: StoryHistoryEntry) {
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.IO).launch {
            val sync = accountSyncManager ?: return@launch
            val url = settingsDataStore.backendUrl.first()
            if (url.isBlank()) return@launch
            sync.pushHistoryEntry(
                baseUrl = url,
                entry = entry,
                localSyncCode = settingsDataStore.syncCode.first(),
                onSyncCodeUpdated = { settingsDataStore.setSyncCode(it) },
            )
        }
    }

    private fun isDuplicateScript(script: String, previous: List<String>): Boolean {
        val normalized = script.lowercase().trim()
        return previous.any { prev ->
            val p = prev.lowercase().trim()
            p == normalized || similarity(p, normalized) > 0.78
        }
    }

    private fun similarity(a: String, b: String): Double {
        val wordsA = a.split(Regex("\\s+")).toSet()
        val wordsB = b.split(Regex("\\s+")).toSet()
        if (wordsA.isEmpty() || wordsB.isEmpty()) return 0.0
        val intersection = wordsA.intersect(wordsB).size
        return intersection.toDouble() / maxOf(wordsA.size, wordsB.size)
    }

    private fun apiKeyForProvider(
        provider: LlmProvider,
        groqKey: String,
        geminiKey: String,
        openRouterKey: String,
        localOllamaUrl: String = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL,
    ): String = when (provider) {
        LlmProvider.GROQ -> groqKey
        LlmProvider.GEMINI -> geminiKey
        LlmProvider.OPENROUTER -> openRouterKey
        LlmProvider.LOCAL -> localOllamaUrl
    }

    private fun shouldTryBackend(url: String): Boolean {
        if (url.isBlank()) return false
        if (url.contains("10.0.2.2") && !isEmulator()) return false
        return true
    }

    private fun isEmulator(): Boolean {
        return Build.FINGERPRINT.contains("generic", ignoreCase = true) ||
            Build.FINGERPRINT.contains("emulator", ignoreCase = true) ||
            Build.MODEL.contains("Emulator", ignoreCase = true) ||
            Build.MODEL.contains("Android SDK built for", ignoreCase = true)
    }

    private fun isCacheExpired(cached: CachedStory): Boolean {
        val maxAgeMs = 24 * 60 * 60 * 1000L
        return System.currentTimeMillis() - cached.fetchedAt > maxAgeMs
    }

    private fun CachedStory.toResponse(): StoryResponse = StoryResponse(
        artist = artist,
        title = title,
        year = year,
        genre = genre,
        script = script,
        demo = demo,
        audioUrl = audioUrl,
    )

    companion object {
        private val LLM_NOT_CONFIGURED_CODES = setOf(
            "OPENROUTER_NOT_CONFIGURED",
            "GROQ_NOT_CONFIGURED",
            "GEMINI_NOT_CONFIGURED",
            "LOCAL_OLLAMA_NOT_CONFIGURED",
        )
        private const val BACKEND_TIMEOUT_MS = 300_000L
        /** Local Ollama: research + up to 8 narrator attempts on 35b model. */
        private const val BACKEND_LOCAL_TIMEOUT_MS = 1_200_000L
        private const val METADATA_TIMEOUT_MS = 15_000L
        /** Must match backend SECURITY.maxPreviousScripts. */
        private const val MAX_PREVIOUS_SCRIPTS = 8
    }
}

