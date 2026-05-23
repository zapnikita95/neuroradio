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
import com.musicstory.app.data.remote.ApiClient
import com.musicstory.app.data.remote.ConnectionCheckResult
import com.musicstory.app.data.remote.ConnectionChecker
import com.musicstory.app.data.remote.GroqStoryClient
import com.musicstory.app.data.remote.MetadataEnricher
import com.musicstory.app.data.remote.RateLimitErrorBody
import com.musicstory.app.data.model.StoryQuotaInfo
import com.google.gson.Gson
import com.musicstory.app.domain.StoryAngle
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.StoryPersona
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
import kotlinx.coroutines.withTimeout
import retrofit2.HttpException
import java.io.IOException

class StoryRepository(
    private val storyDao: StoryDao,
    private val storyHistoryDao: StoryHistoryDao,
    private val settingsDataStore: SettingsDataStore,
    private val apiClient: ApiClient,
    private val groqStoryClient: GroqStoryClient,
    private val metadataEnricher: MetadataEnricher = MetadataEnricher(),
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

    suspend fun checkConnections(groqApiKey: String, backendUrl: String): ConnectionCheckResult {
        val result = connectionChecker.runFullCheck(apiClient, backendUrl.trim(), groqApiKey.trim())
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
            if (cached != null && !cached.demo && !isCacheExpired(cached) && !StoryScriptQuality.isTemplateLike(cached.script)) {
                StoryLog.i("Story from cache")
                return Result.success(cached.toResponse())
            }
        }

        val metadata = try {
            withTimeout(METADATA_TIMEOUT_MS) {
                metadataEnricher.enrich(track.artist, track.title)
            }
        } catch (e: Exception) {
            StoryLog.w("MusicBrainz enrich failed: ${e.message}")
            com.musicstory.app.data.remote.TrackMetadata()
        }

        val year = metadata.year
        val genre = metadata.genre
        val countryCode = metadata.countryCode
        val angle = StoryPersona.pickAngle(previousScripts.size)

        val backendUrl = settingsDataStore.backendUrl.first().trim()
        val groqKey = settingsDataStore.groqApiKey.first().trim()
        val storyLength = settingsDataStore.storyLength.first()
        val storyNarrator = settingsDataStore.storyNarrator.first()
        val ttsVoice = settingsDataStore.ttsVoice.first()
        val ttsSpeed = settingsDataStore.ttsSpeed.first()
        val ttsEmotion = settingsDataStore.ttsEmotion.first()
        val useBackend = shouldTryBackend(backendUrl)
        var rateLimitHit = false
        var rateLimitQuota: StoryQuotaInfo? = null
        var backendGroqDown = false
        var templateRejected = false
        var groqError: String? = null
        var backendError: String? = null

        if (groqKey.isNotEmpty()) {
            when (val groqResult = tryDirectGroq(
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
            )) {
                is StoryAttemptResult.Success -> return Result.success(groqResult.response)
                is StoryAttemptResult.TemplateRejected -> templateRejected = true
                is StoryAttemptResult.Failed -> groqError = groqResult.reason
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
            groqKeyPresent = groqKey.isNotEmpty(),
            backendConfigured = useBackend,
            backendGroqDown = backendGroqDown,
            templateRejected = templateRejected,
            groqError = groqError,
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
                )
            }
            when {
                groqStory == null -> StoryAttemptResult.Failed("Groq не вернул текст истории")
                StoryScriptQuality.isTemplateLike(groqStory.script) -> {
                    StoryLog.w("Direct Groq returned template-like story — rejected")
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
            val reason = formatGroqError(e.message?.take(240))
            StoryLog.e("Direct Groq failed: $reason", e)
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
    ): StoryAttemptResult {
        return try {
            StoryLog.i("Fetching story from backend: $backendUrl")
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
                    ),
                )
            }
            when {
                response.demo -> {
                    StoryLog.w("Backend returned template/demo story — rejected")
                    StoryAttemptResult.TemplateRejected
                }
                StoryScriptQuality.isTemplateLike(response.script) -> {
                    StoryLog.w("Backend returned template-like story — rejected")
                    StoryAttemptResult.TemplateRejected
                }
                response.script.isBlank() || isDuplicateScript(response.script, previousScripts) -> {
                    StoryLog.w("Backend response rejected: empty or duplicate")
                    StoryAttemptResult.Failed("Сервер вернул пустой или повторный текст")
                }
                else -> {
                    response.quota?.let { quota -> _dailyQuota.value = quota }
                    StoryLog.i("Backend OK: audio=${response.audioUrl != null}, quota=${response.quota?.remaining}/${response.quota?.limit}")
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
                StoryLog.w("Backend Groq unavailable: ${explainError(e)}")
                return StoryAttemptResult.Failed(
                    reason = explainError(e),
                    backendGroqDown = true,
                )
            }
            val reason = explainError(e)
            StoryLog.e("Backend failed: $reason", e)
            StoryAttemptResult.Failed(reason)
        }
    }

    private fun buildGenerationFailureMessage(
        rateLimitHit: Boolean,
        rateLimitQuota: StoryQuotaInfo?,
        groqKeyPresent: Boolean,
        backendConfigured: Boolean,
        backendGroqDown: Boolean,
        templateRejected: Boolean,
        groqError: String?,
        backendError: String?,
    ): String {
        if (templateRejected) {
            return "История похожа на шаблон — попробуй ещё раз или другого рассказчика."
        }
        if (groqKeyPresent && !groqError.isNullOrBlank()) {
            return groqError
        }
        if (rateLimitHit) {
            val quotaText = rateLimitQuota?.let { "${it.used}/${it.limit}" }
            return if (groqKeyPresent) {
                if (quotaText != null) {
                    "Лимит сервера исчерпан ($quotaText). Groq с телефона тоже не ответил."
                } else {
                    "Лимит сервера исчерпан. Groq с телефона тоже не ответил."
                }
            } else if (quotaText != null) {
                "Лимит бесплатных историй исчерпан ($quotaText). Добавь Groq-ключ в настройках."
            } else {
                "Лимит бесплатных историй исчерпан. Добавь Groq-ключ в настройках."
            }
        }
        if (groqKeyPresent && !backendError.isNullOrBlank()) {
            return "Groq не сработал, сервер тоже: $backendError"
        }
        if (groqKeyPresent) {
            return "Groq не ответил. Проверь интернет и попробуй ещё раз."
        }
        if (backendConfigured && !backendError.isNullOrBlank()) {
            return if (backendGroqDown) {
                "Сервер без Groq. Добавь свой Groq-ключ в настройках."
            } else {
                "Сервер: $backendError"
            }
        }
        return if (backendConfigured) {
            "Сервер недоступен. Проверь интернет или добавь Groq-ключ в настройках."
        } else {
            "Укажи URL сервера или Groq-ключ в настройках."
        }
    }

    private fun formatGroqError(raw: String?): String {
        if (raw.isNullOrBlank()) return "Groq не ответил"
        val lower = raw.lowercase()
        if (lower.contains("429") && lower.contains("tokens per")) {
            return "Лимит токенов Groq на сегодня исчерпан (считаются вход+выход, не число запросов). Приложение пробует другую модель — подожди минуту и нажми ещё раз."
        }
        if (lower.contains("429") || lower.contains("rate limit")) {
            return "Groq временно ограничил запросы. Подожди минуту и попробуй снова."
        }
        if (lower.startsWith("groq http")) return raw.removePrefix("Groq HTTP ").removePrefix("Groq ")
        return raw
    }

    private fun explainError(e: Exception): String = when (e) {
        is HttpException -> when (e.code()) {
            429 -> "лимит историй"
            503 -> "Groq на сервере недоступен"
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
        storyHistoryDao.insert(
            StoryHistoryEntry(
                trackKey = trackKey,
                artist = track.artist,
                title = track.title,
                script = response.script,
                angle = angle,
            ),
        )
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
        private const val METADATA_TIMEOUT_MS = 4_000L
    }
}

