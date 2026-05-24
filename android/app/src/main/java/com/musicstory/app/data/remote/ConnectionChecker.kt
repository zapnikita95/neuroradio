package com.musicstory.app.data.remote

import com.musicstory.app.data.model.StoryQuotaInfo
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

data class ConnectionCheckResult(
    val llmOk: Boolean? = null,
    val llmMessage: String? = null,
    val backendOk: Boolean = false,
    val backendMessage: String? = null,
    val quota: StoryQuotaInfo? = null,
) {
    val allOk: Boolean
        get() = when {
            llmOk == true -> true
            llmOk == null -> backendOk
            else -> false
        }

    /** @deprecated use llmOk */
    val groqOk: Boolean? get() = llmOk
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

        val body = org.json.JSONObject().apply {
            put("model", "llama-3.1-8b-instant")
            put("max_tokens", 8)
            put("messages", org.json.JSONArray().apply {
                put(org.json.JSONObject().put("role", "user").put("content", "ok"))
            })
        }

        val request = Request.Builder()
            .url("https://api.groq.com/openai/v1/chat/completions")
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer $key")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        runCatching {
            client.newCall(request).execute().use { response ->
                val errorBody = response.body?.string().orEmpty()
                when {
                    response.isSuccessful -> true to "Ключ работает — можно генерировать истории"
                    else -> false to GroqApiErrorParser.parse(response.code, errorBody)
                }
            }
        }.getOrElse { e ->
            StoryLog.w("Groq test failed: ${e.message}")
            false to (e.message ?: "Нет сети")
        }
    }

    suspend fun testGeminiKey(apiKey: String, modelId: String = GeminiModel.defaultRecommended.id): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val key = apiKey.trim()
        if (key.isEmpty()) {
            return@withContext false to "Ключ пустой"
        }

        val url = "https://generativelanguage.googleapis.com/v1beta/models/$modelId:generateContent?key=${java.net.URLEncoder.encode(key, "UTF-8")}"
        val body = org.json.JSONObject().apply {
            put("contents", org.json.JSONArray().apply {
                put(org.json.JSONObject().apply {
                    put("role", "user")
                    put("parts", org.json.JSONArray().apply {
                        put(org.json.JSONObject().put("text", "ok"))
                    })
                })
            })
            put("generationConfig", org.json.JSONObject().apply {
                put("maxOutputTokens", 8)
                if (modelId.startsWith("gemini-2.5")) {
                    put("thinkingConfig", org.json.JSONObject().put("thinkingBudget", 0))
                }
            })
        }

        val request = Request.Builder()
            .url(url)
            .header("Content-Type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        runCatching {
            client.newCall(request).execute().use { response ->
                val errorBody = response.body?.string().orEmpty()
                when {
                    response.isSuccessful -> true to "Ключ работает — можно генерировать истории"
                    else -> false to GeminiErrorParser.parse(response.code, errorBody)
                }
            }
        }.getOrElse { e ->
            StoryLog.w("Gemini test failed: ${e.message}")
            false to (e.message ?: "Нет сети")
        }
    }

    suspend fun testBackend(apiClient: ApiClient, backendUrl: String): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        runCatching {
            val health = apiClient.fetchHealth(backendUrl)
            val groq = health["groq"] as? Boolean ?: false
            val yandex = health["yandexTts"] as? Boolean ?: false
            when {
                groq && yandex -> true to "Сервер работает"
                groq -> true to "Сервер работает"
                else -> true to "Сервер доступен"
            }
        }.getOrElse { e ->
            StoryLog.w("Backend health failed: ${e.message}")
            false to (e.message ?: "Недоступен")
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
        llmProvider: LlmProvider,
        groqApiKey: String,
        geminiApiKey: String,
        geminiModelId: String,
    ): ConnectionCheckResult {
        val activeKey = when (llmProvider) {
            LlmProvider.GROQ -> groqApiKey
            LlmProvider.GEMINI -> geminiApiKey
        }
        val llmResult = if (activeKey.isNotBlank()) {
            when (llmProvider) {
                LlmProvider.GROQ -> testGroqKey(activeKey)
                LlmProvider.GEMINI -> testGeminiKey(activeKey, geminiModelId)
            }
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
            llmOk = llmResult?.first,
            llmMessage = llmResult?.second,
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
    val source: String? = null,
)
