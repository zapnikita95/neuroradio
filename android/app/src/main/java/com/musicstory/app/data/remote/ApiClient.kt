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

    private val baseOkHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(50, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
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
        val local = request.llmProvider == "local"
        val api = getApi(baseUrl, longRead = local)
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
            getApi(baseUrl, longRead = local).fetchFullStory(request)
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

    fun getApi(baseUrl: String, longRead: Boolean = false): StoryApi {
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
        if (audioUrl.startsWith("http://") || audioUrl.startsWith("https://")) {
            return audioUrl
        }
        val base = normalizeBaseUrl(baseUrl).trimEnd('/')
        val path = if (audioUrl.startsWith("/")) audioUrl else "/$audioUrl"
        return base + path
    }

    private fun normalizeBaseUrl(url: String): String {
        val trimmed = url.trim().trimEnd('/')
        return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
    }

    companion object {
        fun defaultBaseUrl(): String = SettingsDataStore.DEFAULT_BACKEND_URL
    }
}
