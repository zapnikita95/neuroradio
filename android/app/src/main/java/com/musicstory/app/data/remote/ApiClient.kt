package com.musicstory.app.data.remote

import com.musicstory.app.BuildConfig
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.util.StoryLog
import com.musicstory.app.data.model.StoryRequest
import com.musicstory.app.data.model.StoryResponse
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
        StoryLog.d(message)
    }.apply {
        level = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BASIC
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
    }

    private val baseOkHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(50, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .addInterceptor(loggingInterceptor)
        .build()

    @Volatile
    private var cachedBaseUrl: String? = null

    @Volatile
    private var cachedApi: StoryApi? = null

    suspend fun fetchFullStory(baseUrl: String, request: StoryRequest): StoryResponse {
        val api = getApi(baseUrl)
        return try {
            api.fetchFullStory(request)
        } catch (first: Exception) {
            StoryLog.w("Story fetch retry after: ${first.message}")
            authManager.invalidateToken()
            getApi(baseUrl).fetchFullStory(request)
        }
    }

    fun getApi(baseUrl: String): StoryApi {
        val normalized = normalizeBaseUrl(baseUrl)
        val current = cachedApi
        if (current != null && cachedBaseUrl == normalized) {
            return current
        }
        return synchronized(this) {
            val again = cachedApi
            if (again != null && cachedBaseUrl == normalized) {
                again
            } else {
                val client = baseOkHttpClient.newBuilder()
                    .addInterceptor(createAuthInterceptor(normalized))
                    .build()
                Retrofit.Builder()
                    .baseUrl(normalized)
                    .client(client)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    .create(StoryApi::class.java)
                    .also {
                        cachedApi = it
                        cachedBaseUrl = normalized
                    }
            }
        }
    }

    fun invalidateCache() {
        synchronized(this) {
            cachedApi = null
            cachedBaseUrl = null
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
