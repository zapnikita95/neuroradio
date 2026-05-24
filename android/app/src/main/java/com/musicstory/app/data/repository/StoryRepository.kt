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
import com.musicstory.app.data.remote.GeminiStoryClient
import com.musicstory.app.data.remote.GroqErrorParser
import com.musicstory.app.data.remote.GroqStoryClient
import com.musicstory.app.data.remote.MetadataCache
import com.musicstory.app.data.remote.RateLimitErrorBody
import com.musicstory.app.data.model.StoryQuotaInfo
import com.google.gson.Gson
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.domain.ReferenceFactPicker
import com.musicstory.app.domain.SelectedReferenceFact
import com.musicstory.app.domain.StoryAngle
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.StoryPersona
import com.musicstory.app.domain.StoryRussianLanguage
import com.musicstory.app.domain.StoryScriptQuality
import com.musicstory.app.domain.TtsEmotion
import com.musicstory.app.domain.TtsSpeed
import com.musicstory.app.domain.TtsVoice
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import retrofit2.HttpException
import java.io.IOException

class StoryRepository(
    private val storyDao: StoryDao,
    private val storyHistoryDao: StoryHistoryDao,
    private val settingsDataStore: SettingsDataStore,
    private val apiClient: ApiClient,
    private val groqStoryClient: GroqStoryClient,
    private val geminiStoryClient: GeminiStoryClient,
    private val accountSyncManager: AccountSyncManager? = null,
    private val metadataCache: MetadataCache,
    private val connectionChecker: ConnectionChecker = ConnectionChecker(),
) {
    private val gson = Gson()

    private val _dailyQuota = MutableStateFlow<StoryQuotaInfo?>(null)
    val dailyQuota: StateFlow<StoryQuotaInfo?> = _dailyQuota.asStateFlow()

    val storyHistory: Flow<List<StoryHistoryEntry>> = storyHistoryDao.observeAll()

    suspend fun refreshQuota() {
        val backendUrl = settingsDataStore.backendUrl.first().trim()
        if (!shouldTryBackend(backendUrl)) return
        runCatching {
            _dailyQuota.value = apiClient.fetchQuota(backendUrl).quota
        }.onFailure {
            StoryLog.w("Quota refresh failed: ${it.message}")
        }
    }

    suspend fun checkConnections(
        llmProvider: LlmProvider,
        groqApiKey: String,
        geminiApiKey: String,
        geminiModel: GeminiModel,
        backendUrl: String,
    ): ConnectionCheckResult {
        val result = connectionChecker.runFullCheck(
            apiClient,
            backendUrl.trim(),
            llmProvider,
            groqApiKey.trim(),
            geminiApiKey.trim(),
            geminiModel.id,
        )
        result.quota?.let { _dailyQuota.value = it }
        return result
    }

    suspend fun fetchStory(track: TrackInfo, forceRefresh: Boolean = true): Result<StoryResponse> {
        if (!track.isValid()) {
            return Result.failure(IllegalArgumentException("Некорректные метаданные трека"))
        }

        val trackKey = track.displayKey
        val previousScripts = storyHistoryDao.getRecentScripts(trackKey)

        if (!forceRefresh && previousScripts.isEmpty()) {
            val cached = storyDao.getByTrackKey(trackKey)
            if (cached != null && !cached.demo && !isCacheExpired(cached) &&
                !StoryScriptQuality.isTemplateLike(cached.script, cached.artist, cached.title)
            ) {
                StoryLog.i("Story from cache")
                return Result.success(cached.toResponse())
            }
        }

        val metadata = try {
            withTimeout(METADATA_TIMEOUT_MS) {
                metadataCache.getOrFetch(track.artist, track.title)
            }
        } catch (e: Exception) {
            StoryLog.w("MusicBrainz enrich failed: ${e.message}")
            com.musicstory.app.data.remote.TrackMetadata()
        }

        val year = metadata.year
        val genre = metadata.genre
        val countryCode = metadata.countryCode
        val factBundle = metadata.factBundle
        val selectedFact = ReferenceFactPicker.pick(factBundle, previousScripts)
        val referenceFacts = ReferenceFactPicker.factsForPrompt(selectedFact)
            .ifEmpty { metadata.referenceFacts }
            .ifEmpty { (factBundle.trackFacts + factBundle.artistFacts).take(4) }
        val angle = StoryPersona.pickAngle(previousScripts.size)

        val backendUrl = settingsDataStore.backendUrl.first().trim()
        val llmProvider = settingsDataStore.llmProvider.first()
        val groqKey = settingsDataStore.groqApiKey.first().trim()
        val geminiKey = settingsDataStore.geminiApiKey.first().trim()
        val storyLength = settingsDataStore.storyLength.first()
        val storyNarrator = settingsDataStore.storyNarrator.first()
        val ttsVoice = settingsDataStore.ttsVoice.first()
        val ttsSpeed = settingsDataStore.ttsSpeed.first()
        val ttsEmotion = settingsDataStore.ttsEmotion.first()
        val geminiModel = settingsDataStore.geminiModel.first()
        val useBackend = shouldTryBackend(backendUrl)
        var rateLimitHit = false
        var rateLimitQuota: StoryQuotaInfo? = null
        var backendGroqDown = false
        var templateRejected = false
        var llmError: String? = null
        var backendError: String? = null

        val directApiKey = when (llmProvider) {
            LlmProvider.GROQ -> groqKey
            LlmProvider.GEMINI -> geminiKey
        }

        StoryLog.i(
            "fetchStory ${track.artist} — ${track.title}: provider=${llmProvider.id}, " +
                "ownKey=${directApiKey.isNotEmpty()}, backend=$useBackend",
        )

        if (llmProvider == LlmProvider.GEMINI && geminiKey.isEmpty()) {
            return Result.failure(
                IOException(
                    "Выбран Gemini, но API-ключ не сохранён. Вставь ключ в Настройки → AI и нажми «Сохранить».",
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

        // Свой ключ — прямой вызов LLM с телефона, без лимитов сервера.
        if (directApiKey.isNotEmpty()) {
            return when (llmProvider) {
                LlmProvider.GEMINI -> when (val geminiResult = tryDirectGemini(
                    geminiKey = geminiKey,
                    geminiModel = geminiModel,
                    track = track,
                    trackKey = trackKey,
                    year = year,
                    genre = genre,
                    countryCode = countryCode,
                    previousScripts = previousScripts,
                    angle = angle,
                    storyLength = storyLength,
                    storyNarrator = storyNarrator,
                    referenceFacts = referenceFacts,
                    selectedFact = selectedFact,
                )) {
                    is StoryAttemptResult.Success -> Result.success(geminiResult.response)
                    is StoryAttemptResult.TemplateRejected -> Result.failure(
                        IOException(GroqStoryClient.STORY_RETRY_MESSAGE),
                    )
                    is StoryAttemptResult.Failed -> Result.failure(IOException(geminiResult.reason))
                }
                LlmProvider.GROQ -> when (val groqResult = tryDirectGroq(
                    groqKey = groqKey,
                    track = track,
                    trackKey = trackKey,
                    year = year,
                    genre = genre,
                    countryCode = countryCode,
                    previousScripts = previousScripts,
                    angle = angle,
                    storyLength = storyLength,
                    storyNarrator = storyNarrator,
                    referenceFacts = referenceFacts,
                    selectedFact = selectedFact,
                )) {
                    is StoryAttemptResult.Success -> Result.success(groqResult.response)
                    is StoryAttemptResult.TemplateRejected -> Result.failure(
                        IOException(GroqStoryClient.STORY_RETRY_MESSAGE),
                    )
                    is StoryAttemptResult.Failed -> Result.failure(IOException(groqResult.reason))
                }
            }
        }

        if (useBackend) {
            when (val backendResult = tryBackendStory(
                backendUrl = backendUrl,
                track = track,
                trackKey = trackKey,
                previousScripts = previousScripts,
                angle = angle,
                storyLength = storyLength,
                storyNarrator = storyNarrator,
                ttsVoice = ttsVoice,
                ttsSpeed = ttsSpeed,
                ttsEmotion = ttsEmotion,
                llmProvider = llmProvider,
                geminiModel = geminiModel,
            )) {
                is StoryAttemptResult.Success -> return Result.success(backendResult.response)
                is StoryAttemptResult.TemplateRejected -> templateRejected = true
                is StoryAttemptResult.Failed -> {
                    backendError = backendResult.reason
                    if (backendResult.backendGroqDown) backendGroqDown = true
                    if (backendResult.rateLimitHit) {
                        rateLimitHit = true
                        rateLimitQuota = backendResult.rateLimitQuota
                    }
                }
            }
        } else {
            StoryLog.w("Backend skipped (url=$backendUrl)")
        }

        val failureMessage = buildGenerationFailureMessage(
            rateLimitHit = rateLimitHit,
            rateLimitQuota = rateLimitQuota,
            llmKeyPresent = directApiKey.isNotEmpty(),
            llmProvider = llmProvider,
            backendConfigured = useBackend,
            backendGroqDown = backendGroqDown,
            templateRejected = templateRejected,
            llmError = llmError,
            backendError = backendError,
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
        ) : StoryAttemptResult()
    }

    private suspend fun tryDirectGroq(
        groqKey: String,
        track: TrackInfo,
        trackKey: String,
        year: Int?,
        genre: String?,
        countryCode: String?,
        previousScripts: List<String>,
        angle: StoryAngle,
        storyLength: StoryLength,
        storyNarrator: StoryNarrator,
        referenceFacts: List<String> = emptyList(),
        selectedFact: SelectedReferenceFact? = null,
    ): StoryAttemptResult {
        return try {
            StoryLog.i("Trying direct Groq from device")
            val groqStory = withTimeout(GROQ_TIMEOUT_MS) {
                groqStoryClient.generateStory(
                    apiKey = groqKey,
                    artist = track.artist,
                    title = track.title,
                    year = year,
                    genre = genre,
                    countryCode = countryCode,
                    previousScripts = previousScripts,
                    angle = angle,
                    storyLength = storyLength,
                    storyNarrator = storyNarrator,
                    referenceFacts = referenceFacts,
                    selectedFact = selectedFact,
                )
            }
            when {
                groqStory == null -> StoryAttemptResult.Failed("Groq не вернул текст истории")
                StoryScriptQuality.hasBannedPattern(groqStory.script) ||
                    StoryRussianLanguage.hasEnglishLeak(groqStory.script, track.artist, track.title) -> {
                    StoryLog.w("Direct Groq returned low-quality story — rejected")
                    StoryAttemptResult.TemplateRejected
                }
                isDuplicateScript(groqStory.script, previousScripts) -> {
                    StoryLog.w("Direct Groq returned duplicate story — rejected")
                    StoryAttemptResult.Failed("Groq вернул повтор предыдущей истории — попробуй ещё раз")
                }
                else -> {
                    StoryLog.i("Direct API key story OK")
                    persistStory(trackKey, track, groqStory, angle.labelRu)
                    StoryAttemptResult.Success(groqStory)
                }
            }
        } catch (e: Exception) {
            val reason = GroqErrorParser.parse(e.message, LlmProvider.GROQ)
            StoryLog.e("Direct Groq failed: $reason", e)
            StoryAttemptResult.Failed(reason)
        }
    }

    private suspend fun tryDirectGemini(
        geminiKey: String,
        geminiModel: GeminiModel,
        track: TrackInfo,
        trackKey: String,
        year: Int?,
        genre: String?,
        countryCode: String?,
        previousScripts: List<String>,
        angle: StoryAngle,
        storyLength: StoryLength,
        storyNarrator: StoryNarrator,
        referenceFacts: List<String> = emptyList(),
        selectedFact: SelectedReferenceFact? = null,
    ): StoryAttemptResult {
        return try {
            StoryLog.i("Trying direct Gemini from device (${geminiModel.id})")
            val geminiStory = withTimeout(GROQ_TIMEOUT_MS) {
                geminiStoryClient.generateStory(
                    apiKey = geminiKey,
                    geminiModel = geminiModel,
                    artist = track.artist,
                    title = track.title,
                    year = year,
                    genre = genre,
                    countryCode = countryCode,
                    previousScripts = previousScripts,
                    angle = angle,
                    storyLength = storyLength,
                    storyNarrator = storyNarrator,
                    referenceFacts = referenceFacts,
                    selectedFact = selectedFact,
                )
            }
            when {
                geminiStory == null -> StoryAttemptResult.Failed("Gemini не вернул текст истории")
                StoryScriptQuality.hasBannedPattern(geminiStory.script) ||
                    StoryRussianLanguage.hasEnglishLeak(geminiStory.script, track.artist, track.title) -> {
                    StoryLog.w("Direct Gemini returned low-quality story — rejected")
                    StoryAttemptResult.TemplateRejected
                }
                isDuplicateScript(geminiStory.script, previousScripts) -> {
                    StoryLog.w("Direct Gemini returned duplicate story — rejected")
                    StoryAttemptResult.Failed("Gemini вернул повтор предыдущей истории — попробуй ещё раз")
                }
                else -> {
                    StoryLog.i("Direct Gemini API key story OK")
                    persistStory(trackKey, track, geminiStory, angle.labelRu)
                    StoryAttemptResult.Success(geminiStory)
                }
            }
        } catch (e: Exception) {
            val reason = GroqErrorParser.parse(e.message, LlmProvider.GEMINI)
            StoryLog.e("Direct Gemini failed: $reason", e)
            StoryAttemptResult.Failed(reason)
        }
    }

    private suspend fun tryBackendStory(
        backendUrl: String,
        track: TrackInfo,
        trackKey: String,
        previousScripts: List<String>,
        angle: StoryAngle,
        storyLength: StoryLength,
        storyNarrator: StoryNarrator,
        ttsVoice: TtsVoice,
        ttsSpeed: TtsSpeed,
        ttsEmotion: TtsEmotion,
        llmProvider: LlmProvider,
        geminiModel: GeminiModel,
    ): StoryAttemptResult {
        return try {
            StoryLog.i("Fetching story from backend: $backendUrl (llm=${llmProvider.id}, gemini=${geminiModel.id})")
            val response = withTimeout(BACKEND_TIMEOUT_MS) {
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
                        geminiModel = if (llmProvider == LlmProvider.GEMINI) geminiModel.id else null,
                    ),
                )
            }
            when {
                response.demo -> {
                    StoryLog.w("Backend returned template/demo story — rejected")
                    StoryAttemptResult.TemplateRejected
                }
                StoryScriptQuality.isTemplateLike(response.script, track.artist, track.title) -> {
                    StoryLog.w("Backend returned template-like story — rejected")
                    StoryAttemptResult.TemplateRejected
                }
                response.script.isBlank() || isDuplicateScript(response.script, previousScripts) -> {
                    StoryLog.w("Backend response rejected: empty or duplicate")
                    StoryAttemptResult.Failed("Сервер вернул пустой или повторный текст")
                }
                response.audioUrl.isNullOrBlank() -> {
                    StoryLog.e("Backend returned story without Yandex audioUrl")
                    StoryAttemptResult.Failed(
                        "Сервер не отдал озвучку Yandex. Проверь YANDEX_API_KEY и YANDEX_FOLDER_ID на Railway.",
                    )
                }
                else -> {
                    response.quota?.let { quota -> _dailyQuota.value = quota }
                    StoryLog.i("Backend OK: audio=yes, quota=${response.quota?.remaining}/${response.quota?.limit}")
                    persistStory(trackKey, track, response, angle.labelRu)
                    StoryAttemptResult.Success(response)
                }
            }
        } catch (e: Exception) {
            if (e is HttpException && e.code() == 429) {
                val quota = parseRateLimitBody(e)
                quota?.let { _dailyQuota.value = it }
                StoryLog.w("Backend daily limit reached: ${quota?.used}/${quota?.limit}")
                return StoryAttemptResult.Failed(
                    reason = "Лимит бесплатных историй на сервере",
                    rateLimitHit = true,
                    rateLimitQuota = quota,
                )
            }
            if (e is HttpException && e.code() == 503) {
                val reason = sanitizeBackendError(parseHttpErrorBody(e, llmProvider), llmProvider)
                    ?: "Сервер без ${llmProvider.labelRu} — добавь свой ключ в настройках"
                StoryLog.w("Backend LLM unavailable: $reason")
                return StoryAttemptResult.Failed(
                    reason = reason,
                    backendGroqDown = true,
                )
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
        llmKeyPresent: Boolean,
        llmProvider: LlmProvider,
        backendConfigured: Boolean,
        backendGroqDown: Boolean,
        templateRejected: Boolean,
        llmError: String?,
        backendError: String?,
    ): String {
        val providerLabel = llmProvider.labelRu
        if (templateRejected) {
            return GroqStoryClient.STORY_RETRY_MESSAGE
        }
        if (llmKeyPresent && !llmError.isNullOrBlank()) {
            return llmError
        }
        if (rateLimitHit && llmKeyPresent) {
            return llmError ?: "Лимит бесплатных историй на сервере. Свой $providerLabel-ключ тоже не сработал — см. ошибку выше."
        }
        if (rateLimitHit) {
            val quotaText = rateLimitQuota?.let { "${it.used}/${it.limit}" }
            return if (quotaText != null) {
                "Лимит сервера Music Story ($quotaText из ${rateLimitQuota.limit} в день). Свой $providerLabel-ключ обходит этот лимит."
            } else {
                "Лимит сервера Music Story (10 историй в день). Свой $providerLabel-ключ обходит этот лимит."
            }
        }
        if (llmKeyPresent && !backendError.isNullOrBlank()) {
            return "$providerLabel не сработал, сервер тоже: $backendError"
        }
        if (llmKeyPresent) {
            return "$providerLabel не ответил. Проверь интернет и попробуй ещё раз."
        }
        if (backendConfigured && !backendError.isNullOrBlank()) {
            return if (backendGroqDown) {
                "Сервер без $providerLabel. Добавь свой $providerLabel-ключ в настройках."
            } else {
                "Сервер: $backendError"
            }
        }
        return if (backendConfigured) {
            "Сервер недоступен. Проверь интернет или добавь $providerLabel-ключ в настройках."
        } else {
            "Укажи URL сервера или $providerLabel-ключ в настройках."
        }
    }

    private fun parseHttpErrorBody(e: HttpException, llmProvider: LlmProvider): String? {
        val body = e.response()?.errorBody()?.string().orEmpty()
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
                    "Сервер ещё на старом Groq-бэкенде. Добавь свой Gemini-ключ или задеплой новый бэкенд на Railway."
                GroqErrorParser.isAuthError(message) ->
                    "Неверный API-ключ на сервере — добавь свой ${llmProvider.labelRu}-ключ в настройках."
                else -> message.take(200)
            }
        }.getOrNull()
    }

    private fun sanitizeBackendError(message: String?, llmProvider: LlmProvider): String? {
        if (message.isNullOrBlank()) return null
        if (llmProvider != LlmProvider.GEMINI) return message
        if (message.contains("Groq", ignoreCase = true) &&
            (message.contains("лимит", ignoreCase = true) || message.contains("limit", ignoreCase = true))
        ) {
            return "Ошибка сервера (Groq), а у тебя выбран Gemini. Сохрани Gemini-ключ в настройках — истории пойдут с телефона, минуя сервер."
        }
        if (message.contains("Groq", ignoreCase = true)) {
            return "Сервер ответил про Groq, хотя выбран Gemini. Сохрани Gemini-ключ или обнови бэкенд на Railway."
        }
        return message
    }

    private fun explainError(e: Exception, llmProvider: LlmProvider): String = when (e) {
        is HttpException -> when (e.code()) {
            429 -> "Лимит сервера Music Story (10/день)"
            503 -> "${llmProvider.labelRu} на сервере недоступен"
            else -> "HTTP ${e.code()}"
        }
        is IOException -> "нет сети"
        else -> e.message?.take(80) ?: e.javaClass.simpleName
    }

    private fun parseRateLimitBody(e: HttpException): StoryQuotaInfo? {
        val body = e.response()?.errorBody()?.string() ?: return null
        return runCatching {
            gson.fromJson(body, RateLimitErrorBody::class.java).quota
        }.getOrNull()
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
            val syncCode = settingsDataStore.syncCode.first()
            if (syncCode.isBlank() && !settingsDataStore.accountLinked.first()) return@launch
            sync.pushHistoryEntry(
                baseUrl = url,
                entry = entry,
                localSyncCode = syncCode,
                onSyncCodeUpdated = { settingsDataStore.setSyncCode(it) },
            )
        }
    }

    private fun isDuplicateScript(script: String, previous: List<String>): Boolean {
        val normalized = script.lowercase().trim()
        return previous.any { prev ->
            val p = prev.lowercase().trim()
            p == normalized || similarity(p, normalized) > 0.85
        }
    }

    private fun similarity(a: String, b: String): Double {
        val wordsA = a.split(Regex("\\s+")).toSet()
        val wordsB = b.split(Regex("\\s+")).toSet()
        if (wordsA.isEmpty() || wordsB.isEmpty()) return 0.0
        val intersection = wordsA.intersect(wordsB).size
        return intersection.toDouble() / maxOf(wordsA.size, wordsB.size)
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
        private const val GROQ_TIMEOUT_MS = 50_000L
        private const val BACKEND_TIMEOUT_MS = 55_000L
        private const val METADATA_TIMEOUT_MS = 15_000L
    }
}

