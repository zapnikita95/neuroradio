package com.musicstory.app.data.remote

import com.musicstory.app.data.model.StoryQuotaInfo
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

data class ConnectionCheckResult(
    val groqOk: Boolean? = null,
    val groqMessage: String? = null,
    val backendOk: Boolean = false,
    val backendMessage: String? = null,
    val quota: StoryQuotaInfo? = null,
) {
    val allOk: Boolean
        get() = backendOk && (groqOk != false)
}

class ConnectionChecker(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build(),
) {

    suspend fun testGroqKey(apiKey: String): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val key = apiKey.trim()
        if (key.isEmpty()) {
            return@withContext false to "Ключ пустой"
        }

        val request = Request.Builder()
            .url("https://api.groq.com/openai/v1/models")
            .header("Authorization", "Bearer $key")
            .get()
            .build()

        runCatching {
            client.newCall(request).execute().use { response ->
                when {
                    response.isSuccessful -> true to "Groq: ключ работает"
                    response.code == 401 || response.code == 403 ->
                        false to "Groq: неверный ключ (${response.code})"
                    else -> false to "Groq: ошибка ${response.code}"
                }
            }
        }.getOrElse { e ->
            StoryLog.w("Groq test failed: ${e.message}")
            false to "Groq: ${e.message ?: "нет сети"}"
        }
    }

    suspend fun testBackend(apiClient: ApiClient, backendUrl: String): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        runCatching {
            val health = apiClient.fetchHealth(backendUrl)
            val groq = health["groq"] as? Boolean ?: false
            val yandex = health["yandexTts"] as? Boolean ?: false
            when {
                groq && yandex -> true to "Сервер: Groq + голос Yandex OK"
                groq -> true to "Сервер: Groq OK (Yandex TTS не настроен)"
                else -> true to "Сервер доступен (Groq на сервере выключен)"
            }
        }.getOrElse { e ->
            StoryLog.w("Backend health failed: ${e.message}")
            false to "Сервер: ${e.message ?: "недоступен"}"
        }
    }

    suspend fun fetchQuota(apiClient: ApiClient, backendUrl: String): StoryQuotaInfo? = withContext(Dispatchers.IO) {
        runCatching {
            apiClient.fetchQuota(backendUrl).quota
        }.getOrElse {
            StoryLog.w("Quota fetch failed: ${it.message}")
            null
        }
    }

    suspend fun runFullCheck(
        apiClient: ApiClient,
        backendUrl: String,
        groqApiKey: String,
    ): ConnectionCheckResult {
        val groqResult = if (groqApiKey.isNotBlank()) {
            testGroqKey(groqApiKey)
        } else {
            null
        }

        val backendResult = testBackend(apiClient, backendUrl)
        val quota = if (backendResult.first) {
            fetchQuota(apiClient, backendUrl)
        } else {
            null
        }

        return ConnectionCheckResult(
            groqOk = groqResult?.first,
            groqMessage = groqResult?.second,
            backendOk = backendResult.first,
            backendMessage = backendResult.second,
            quota = quota,
        )
    }
}

data class QuotaResponse(
    val tier: String? = null,
    val quota: StoryQuotaInfo? = null,
    val hint: String? = null,
)

data class RateLimitErrorBody(
    val error: String? = null,
    val code: String? = null,
    val quota: StoryQuotaInfo? = null,
)
