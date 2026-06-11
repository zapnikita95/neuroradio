package com.musicstory.app.data.remote

import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.util.StoryLog
import com.musicstory.app.data.model.StoryRequest
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.data.model.LlmProbeRequest
import com.musicstory.app.data.model.LlmProbeResponse
import com.musicstory.app.data.remote.QuotaResponse
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class ApiClient(
    private val authManager: BackendAuthManager,
) {

    private val loggingInterceptor = HttpLoggingInterceptor { message ->
        StoryLog.i("HTTP $message")
    }.apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private val storyCallLock = Any()

    @Volatile
    private var activeStoryCall: okhttp3.Call? = null

    /** Tracks active POST /v1/story/full — cancel only via [cancelActiveStoryRequest] (track skip). */
    private val storyCancelInterceptor = Interceptor { chain ->
        val call = chain.call()
        synchronized(storyCallLock) {
            activeStoryCall = call
        }
        try {
            chain.proceed(chain.request())
        } finally {
            synchronized(storyCallLock) {
                if (activeStoryCall === call) activeStoryCall = null
            }
        }
    }

    fun cancelActiveStoryRequest(reason: String = "unknown") {
        synchronized(storyCallLock) {
            val call = activeStoryCall
            if (call != null) {
                call.cancel()
                StoryLog.w("HTTP story/full cancelled: $reason")
            }
            activeStoryCall = null
        }
    }

    private val baseOkHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(50, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .addInterceptor(loggingInterceptor)
        .build()

    /** Story generation can take 2+ minutes (facts + LLM + TTS queue on server). */
    private val storyOkHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.MINUTES)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(storyCancelInterceptor)
        .addInterceptor(loggingInterceptor)
        .build()

    /** Local Ollama on PC — research + narrator can take several minutes. */
    private val localStoryOkHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.MINUTES)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(loggingInterceptor)
        .build()

    @Volatile
    private var cachedBaseUrl: String? = null

    @Volatile
    private var cachedApi: StoryApi? = null

    suspend fun fetchFullStory(baseUrl: String, request: StoryRequest): StoryResponse {
        val longRead = request.llmProvider == "local"
        val api = getApi(baseUrl, longRead = longRead, storyGeneration = !longRead)
        StoryLog.i("POST /v1/story/full llm=${request.llmProvider} ${request.artist} — ${request.title}")
        return try {
            val response = api.fetchFullStory(request)
            StoryLog.i(
                "POST /v1/story/full OK words=${response.wordCount} audio=${!response.audioUrl.isNullOrBlank()}",
            )
            response
        } catch (first: Exception) {
            val http = first as? retrofit2.HttpException
            if (http != null && http.code() != 401) throw first
            StoryLog.w("Story fetch retry after: ${first.message}")
            authManager.invalidateToken()
            getApi(baseUrl, longRead = longRead, storyGeneration = !longRead).fetchFullStory(request)
        }
    }

    suspend fun fetchHealth(baseUrl: String): Map<String, Any?> {
        return getApi(baseUrl).health()
    }

    suspend fun fetchOllamaHealth(
        baseUrl: String,
        ollamaUrl: String,
        model: String,
    ): Map<String, Any?> {
        return getApi(baseUrl, longRead = true).healthOllama(
            ollamaUrl = ollamaUrl.trim().trimEnd('/').ifBlank { null },
            model = model.trim().ifBlank { null },
        )
    }

    suspend fun fetchQuota(baseUrl: String): QuotaResponse {
        return getApi(baseUrl).fetchQuota()
    }

    suspend fun fetchFactHint(baseUrl: String, artist: String, title: String): FactHintResponse {
        return try {
            getApi(baseUrl).fetchFactHint(artist, title)
        } catch (first: Exception) {
            StoryLog.w("Fact hint retry after: ${first.message}")
            authManager.invalidateToken()
            getApi(baseUrl).fetchFactHint(artist, title)
        }
    }

    suspend fun setDevTier(baseUrl: String, tier: String?): DevTierResponse {
        return try {
            getApi(baseUrl).setDevTier(DevTierRequest(tier))
        } catch (first: Exception) {
            authManager.invalidateToken()
            getApi(baseUrl).setDevTier(DevTierRequest(tier))
        }
    }

    suspend fun fetchBillingStatus(baseUrl: String, appLanguage: String? = null): BillingStatusResponse {
        return getApi(baseUrl).billingStatus(appLanguage)
    }

    suspend fun checkLanguageSwitch(baseUrl: String, target: String): LanguageSwitchResponse {
        return try {
            getApi(baseUrl).languageSwitch(target)
        } catch (first: Exception) {
            authManager.invalidateToken()
            getApi(baseUrl).languageSwitch(target)
        }
    }

    suspend fun verifyGooglePlayPurchase(
        baseUrl: String,
        productId: String,
        purchaseToken: String,
    ): IapVerifyResponse {
        return try {
            getApi(baseUrl).verifyGooglePlay(
                GooglePlayVerifyRequest(productId = productId, purchaseToken = purchaseToken),
            )
        } catch (first: Exception) {
            authManager.invalidateToken()
            getApi(baseUrl).verifyGooglePlay(
                GooglePlayVerifyRequest(productId = productId, purchaseToken = purchaseToken),
            )
        }
    }

    suspend fun unlinkCard(baseUrl: String): UnlinkCardResponse {
        return try {
            getApi(baseUrl).unlinkCard()
        } catch (first: Exception) {
            authManager.invalidateToken()
            getApi(baseUrl).unlinkCard()
        }
    }

    suspend fun createPayment(baseUrl: String, email: String, plan: String): PaymentCreateResponse {
        return try {
            getApi(baseUrl).createPayment(PaymentCreateRequest(email = email, plan = plan))
        } catch (e: retrofit2.HttpException) {
            val body = e.response()?.errorBody()?.string().orEmpty()
            val parsed = runCatching {
                org.json.JSONObject(body)
            }.getOrNull()
            val message = parsed?.optString("error")?.takeIf { it.isNotBlank() }
                ?: parsed?.optString("hint")?.takeIf { it.isNotBlank() }
                ?: e.message()
            throw IllegalStateException(message)
        }
    }

    suspend fun probeLlm(baseUrl: String, request: LlmProbeRequest): LlmProbeResponse {
        return try {
            getApi(baseUrl).probeLlm(request)
        } catch (first: Exception) {
            StoryLog.w("LLM probe retry after: ${first.message}")
            authManager.invalidateToken()
            getApi(baseUrl).probeLlm(request)
        }
    }

    @Volatile
    private var cachedLocalApi: StoryApi? = null

    @Volatile
    private var cachedLocalBaseUrl: String? = null

    @Volatile
    private var cachedStoryApi: StoryApi? = null

    @Volatile
    private var cachedStoryBaseUrl: String? = null

    fun getApi(baseUrl: String, longRead: Boolean = false, storyGeneration: Boolean = false): StoryApi {
        val normalized = normalizeBaseUrl(baseUrl)
        if (longRead) {
            val current = cachedLocalApi
            if (current != null && cachedLocalBaseUrl == normalized) {
                return current
            }
            return synchronized(this) {
                val again = cachedLocalApi
                if (again != null && cachedLocalBaseUrl == normalized) {
                    again
                } else {
                    buildApi(normalized, localStoryOkHttpClient).also {
                        cachedLocalApi = it
                        cachedLocalBaseUrl = normalized
                    }
                }
            }
        }
        if (storyGeneration) {
            val current = cachedStoryApi
            if (current != null && cachedStoryBaseUrl == normalized) {
                return current
            }
            return synchronized(this) {
                val again = cachedStoryApi
                if (again != null && cachedStoryBaseUrl == normalized) {
                    again
                } else {
                    buildApi(normalized, storyOkHttpClient).also {
                        cachedStoryApi = it
                        cachedStoryBaseUrl = normalized
                    }
                }
            }
        }
        val current = cachedApi
        if (current != null && cachedBaseUrl == normalized) {
            return current
        }
        return synchronized(this) {
            val again = cachedApi
            if (again != null && cachedBaseUrl == normalized) {
                again
            } else {
                buildApi(normalized, baseOkHttpClient).also {
                    cachedApi = it
                    cachedBaseUrl = normalized
                }
            }
        }
    }

    private fun buildApi(baseUrl: String, httpClient: OkHttpClient): StoryApi {
        val client = httpClient.newBuilder()
            .addInterceptor(createAuthInterceptor(baseUrl))
            .build()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(StoryApi::class.java)
    }

    fun invalidateCache() {
        synchronized(this) {
            cachedApi = null
            cachedBaseUrl = null
            cachedLocalApi = null
            cachedLocalBaseUrl = null
            cachedStoryApi = null
            cachedStoryBaseUrl = null
        }
    }

    private fun createAuthInterceptor(baseUrl: String): Interceptor {
        return Interceptor { chain ->
            val token = runBlocking { authManager.getAccessToken(baseUrl) }
            val original = chain.request()
            val request = if (!token.isNullOrBlank()) {
                original.newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            } else {
                original
            }

            val response = chain.proceed(request)
            if (response.code == 401) {
                response.close()
                val refreshed = runBlocking {
                    authManager.invalidateToken()
                    authManager.getAccessToken(baseUrl, forceRefresh = true)
                }
                if (!refreshed.isNullOrBlank()) {
                    val retry = original.newBuilder()
                        .header("Authorization", "Bearer $refreshed")
                        .build()
                    return@Interceptor chain.proceed(retry)
                }
            }
            response
        }
    }

    fun resolveAudioUrl(baseUrl: String, audioUrl: String?): String? {
        if (audioUrl.isNullOrBlank()) return null
        val base = normalizeBaseUrl(baseUrl).trimEnd('/')
        val pathAndQuery = when {
            audioUrl.startsWith("http://") || audioUrl.startsWith("https://") -> {
                val uri = android.net.Uri.parse(audioUrl)
                val path = uri.encodedPath.orEmpty()
                val query = uri.encodedQuery
                if (query.isNullOrBlank()) path else "$path?$query"
            }
            audioUrl.startsWith("/") -> audioUrl
            else -> "/$audioUrl"
        }
        return base + pathAndQuery
    }

    suspend fun submitStoryPlaybackComplete(
        baseUrl: String,
        response: StoryResponse,
        storyNarrator: String?,
    ) {
        val seedFact = response.seedFact?.trim().orEmpty()
        if (seedFact.isEmpty()) return
        val body = StoryCompleteRequest(
            artist = response.artist,
            title = response.title,
            script = response.script,
            seedFact = seedFact,
            seedScope = response.seedScope,
            seedInterestScore = response.seedInterestScore,
            seedInterestRating = response.seedInterestRating,
            storyNarrator = storyNarrator,
        )
        try {
            getApi(baseUrl).submitStoryComplete(body)
        } catch (first: Exception) {
            val http = first as? retrofit2.HttpException
            if (http != null && http.code() != 401) return
            authManager.invalidateToken()
            getApi(baseUrl).submitStoryComplete(body)
        }
    }

    suspend fun submitStoryFeedback(
        baseUrl: String,
        artist: String,
        title: String,
        vote: String,
        reasons: List<String>,
        script: String?,
        historyId: String? = null,
        storyNarrator: String? = null,
        seedFact: String? = null,
        genre: String? = null,
        year: Int? = null,
        lang: String? = null,
    ): Boolean {
        if (reasons.isEmpty()) return false
        val body = StoryFeedbackRequest(
            artist = artist,
            title = title,
            vote = vote,
            reason = reasons.first(),
            reasons = reasons,
            script = script,
            historyId = historyId,
            story_narrator = storyNarrator,
            seed_fact = seedFact,
            genre = genre,
            year = year,
            lang = lang,
        )
        return try {
            getApi(baseUrl).submitStoryFeedback(body)
            true
        } catch (first: Exception) {
            val http = first as? retrofit2.HttpException
            if (http != null && http.code() != 401) return false
            authManager.invalidateToken()
            runCatching { getApi(baseUrl).submitStoryFeedback(body) }.isSuccess
        }
    }

    private fun normalizeBaseUrl(url: String): String {
        val trimmed = url.trim().trimEnd('/')
        return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
    }

    companion object {
        fun defaultBaseUrl(): String = SettingsDataStore.DEFAULT_BACKEND_URL
    }
}
