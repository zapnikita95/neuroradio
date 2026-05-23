package com.musicstory.app.data.remote

import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.model.StoryRequest
import com.musicstory.app.data.model.StoryResponse
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(50, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .addInterceptor(loggingInterceptor)
        .build()

    @Volatile
    private var cachedBaseUrl: String? = null

    @Volatile
    private var cachedSecret: String? = null

    @Volatile
    private var cachedApi: StoryApi? = null

    fun getApi(baseUrl: String, proxySecret: String = ""): StoryApi {
        val normalized = normalizeBaseUrl(baseUrl)
        val secret = proxySecret.trim()
        val current = cachedApi
        if (current != null && cachedBaseUrl == normalized && cachedSecret == secret) {
            return current
        }
        return synchronized(this) {
            val again = cachedApi
            if (again != null && cachedBaseUrl == normalized && cachedSecret == secret) {
                again
            } else {
                val client = if (secret.isEmpty()) {
                    okHttpClient
                } else {
                    okHttpClient.newBuilder()
                        .addInterceptor(
                            Interceptor { chain ->
                                chain.proceed(
                                    chain.request().newBuilder()
                                        .header("X-Music-Story-Secret", secret)
                                        .build(),
                                )
                            },
                        )
                        .build()
                }
                Retrofit.Builder()
                    .baseUrl(normalized)
                    .client(client)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    .create(StoryApi::class.java)
                    .also {
                        cachedApi = it
                        cachedBaseUrl = normalized
                        cachedSecret = secret
                    }
            }
        }
    }

    fun invalidateCache() {
        synchronized(this) {
            cachedApi = null
            cachedBaseUrl = null
            cachedSecret = null
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

    fun defaultApi(): StoryApi = getApi(SettingsDataStore.DEFAULT_BACKEND_URL)
}
