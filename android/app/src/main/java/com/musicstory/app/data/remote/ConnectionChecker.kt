package com.musicstory.app.data.remote

import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.model.StoryQuotaInfo
import com.musicstory.app.data.model.LlmProbeRequest
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.LlmProvider
import com.musicstory.app.util.StoryLog
import com.musicstory.app.util.ApiKeySanitizer
import com.musicstory.app.util.BackendUrlRules
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
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

    suspend fun testLlmKeyViaBackend(
        apiClient: ApiClient,
        backendUrl: String,
        llmProvider: LlmProvider,
        apiKey: String,
        modelId: String,
        groqApiKey: String = "",
        geminiApiKey: String = "",
        openRouterApiKey: String = "",
    ): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val url = backendUrl.trim()
        if (url.isBlank()) {
            return@withContext false to "Укажи URL Railway — из РФ Groq/Gemini только через сервер"
        }

        val cleanKey = ApiKeySanitizer.clean(apiKey)
        val request = LlmProbeRequest(
            llmProvider = llmProvider.id,
            model = modelId.ifBlank { null },
            groqApiKey = when (llmProvider) {
                LlmProvider.GROQ -> cleanKey.takeIf { it.isNotBlank() }
                else -> groqApiKey.takeIf { ApiKeySanitizer.clean(it).isNotBlank() }
            },
            geminiApiKey = when (llmProvider) {
                LlmProvider.GEMINI -> cleanKey.takeIf { it.isNotBlank() }
                else -> geminiApiKey.takeIf { ApiKeySanitizer.clean(it).isNotBlank() }
            },
            openRouterApiKey = when (llmProvider) {
                LlmProvider.OPENROUTER -> cleanKey.takeIf { it.isNotBlank() }
                else -> openRouterApiKey.takeIf { ApiKeySanitizer.clean(it).isNotBlank() }
            },
        )

        runCatching {
            val response = apiClient.probeLlm(url, request)
            if (response.ok) {
                true to response.message.ifBlank { "Ключ работает через Railway" }
            } else {
                false to response.message.ifBlank { "Проверка не прошла" }
            }
        }.getOrElse { e ->
            StoryLog.w("LLM probe via backend failed: ${e.message}")
            if (e is HttpException) {
                val body = e.response()?.errorBody()?.string().orEmpty()
                val msg = runCatching {
                    org.json.JSONObject(body).optString("message")
                }.getOrDefault("").ifBlank { e.message() }
                false to msg
            } else {
                false to (e.message ?: "Сервер недоступен")
            }
        }
    }

    /** @deprecated Direct Groq from device is geo-blocked in RU — use testLlmKeyViaBackend */
    suspend fun testGroqKey(apiKey: String, modelId: String = "llama-3.3-70b-versatile"): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val key = ApiKeySanitizer.clean(apiKey)
        if (key.isEmpty()) {
            return@withContext false to "Ключ пустой"
        }

        val body = org.json.JSONObject().apply {
            put("model", modelId)
            put("max_tokens", 8)
            put("messages", org.json.JSONArray().apply {
                put(org.json.JSONObject().put("role", "user").put("content", "ok"))
            })
        }

        runCatching {
            val request = Request.Builder()
                .url("https://api.groq.com/openai/v1/chat/completions")
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer $key")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(request).execute().use { response ->
                val errorBody = response.body?.string().orEmpty()
                when {
                    response.isSuccessful -> true to "Ключ работает — можно генерировать истории"
                    else -> {
                        StoryLog.w(
                            "Groq test HTTP ${response.code} model=$modelId: ${errorBody.take(400)}",
                        )
                        false to GroqApiErrorParser.parse(response.code, errorBody)
                    }
                }
            }
        }.getOrElse { e ->
            StoryLog.w("Groq test failed: ${e.message}")
            false to (e.message ?: "Нет сети")
        }
    }

    suspend fun testOpenRouterKey(
        apiKey: String,
        modelId: String = "qwen/qwen3-4b:free",
    ): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val key = ApiKeySanitizer.clean(apiKey)
        if (key.isEmpty()) {
            return@withContext false to "Ключ пустой"
        }

        val body = org.json.JSONObject().apply {
            put("model", modelId)
            put("max_tokens", 8)
            put("messages", org.json.JSONArray().apply {
                put(org.json.JSONObject().put("role", "user").put("content", "ok"))
            })
        }

        runCatching {
            val request = Request.Builder()
                .url("https://openrouter.ai/api/v1/chat/completions")
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer $key")
                .header("HTTP-Referer", "https://music-story.app")
                .header("X-Title", "Music Story")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(request).execute().use { response ->
                val errorBody = response.body?.string().orEmpty()
                when {
                    response.isSuccessful -> true to "OpenRouter работает — модель $modelId"
                    else -> false to GroqApiErrorParser.parse(response.code, errorBody)
                }
            }
        }.getOrElse { e ->
            StoryLog.w("OpenRouter test failed: ${e.message}")
            false to (e.message ?: "Нет сети")
        }
    }

    suspend fun testGeminiKey(apiKey: String, modelId: String = GeminiModel.defaultRecommended.id): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val key = ApiKeySanitizer.clean(apiKey)
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

        runCatching {
            val request = Request.Builder()
                .url(url)
                .header("Content-Type", "application/json")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(request).execute().use { response ->
                val errorBody = response.body?.string().orEmpty()
                when {
                    response.isSuccessful -> true to "Ключ работает — можно генерировать истории"
                    else -> {
                        StoryLog.w(
                            "Gemini test HTTP ${response.code} model=$modelId: ${errorBody.take(400)}",
                        )
                        false to GeminiErrorParser.parse(response.code, errorBody, modelId)
                    }
                }
            }
        }.getOrElse { e ->
            StoryLog.w("Gemini test failed: ${e.message}")
            false to (e.message ?: "Нет сети")
        }
    }

    suspend fun testLocalOllamaViaBackend(
        apiClient: ApiClient,
        backendUrl: String,
        ollamaUrl: String,
        modelId: String = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_MODEL,
    ): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val url = ollamaUrl.trim().trimEnd('/').ifBlank { SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL }
        val model = modelId.trim().ifBlank { SettingsDataStore.DEFAULT_LOCAL_OLLAMA_MODEL }
        runCatching {
            val health = apiClient.fetchOllamaHealth(backendUrl, url, model)
            val ok = health["ok"] as? Boolean ?: false
            val message = health["message"]?.toString().orEmpty()
            if (ok) {
                true to (message.ifBlank { "Ollama на ПК с BFF — $model" })
            } else {
                false to (message.ifBlank { "Ollama недоступен с ПК BFF ($url)" })
            }
        }.getOrElse { e ->
            StoryLog.w("Ollama via backend failed: ${e.message}")
            if (e is HttpException) {
                val body = e.response()?.errorBody()?.string().orEmpty()
                val msg = runCatching {
                    org.json.JSONObject(body).optString("message")
                }.getOrDefault("").ifBlank { e.message() }
                false to msg
            } else {
                false to (e.message ?: "BFF не проверил Ollama — перезапусти start-local-bff.bat")
            }
        }
    }

    /** Direct probe — only works when Ollama is reachable from this device (emulator/PC). */
    suspend fun testLocalOllama(
        baseUrl: String,
        modelId: String = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_MODEL,
    ): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val url = baseUrl.trim().trimEnd('/').ifBlank { SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL }
        if (url.isEmpty()) {
            return@withContext false to "URL Ollama пустой"
        }

        runCatching {
            val tagsRequest = Request.Builder()
                .url("$url/api/tags")
                .get()
                .build()
            client.newCall(tagsRequest).execute().use { response ->
                val errorBody = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    StoryLog.w("Ollama tags HTTP ${response.code}: ${errorBody.take(300)}")
                    return@withContext false to "Ollama недоступен (HTTP ${response.code})"
                }
            }

            val body = org.json.JSONObject().apply {
                put("model", modelId)
                put("stream", false)
                put("think", false)
                put("messages", org.json.JSONArray().apply {
                    put(org.json.JSONObject().put("role", "user").put("content", "Ответь одним словом: ок"))
                })
                put("options", org.json.JSONObject().apply {
                    put("num_predict", 16)
                    put("temperature", 0.1)
                })
            }
            val chatRequest = Request.Builder()
                .url("$url/api/chat")
                .header("Content-Type", "application/json")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(chatRequest).execute().use { response ->
                val errorBody = response.body?.string().orEmpty()
                when {
                    response.isSuccessful -> {
                        val content = org.json.JSONObject(errorBody)
                            .optJSONObject("message")
                            ?.optString("content")
                            .orEmpty()
                        true to "Ollama работает — $modelId (${content.take(24).ifBlank { "ok" }})"
                    }
                    else -> {
                        StoryLog.w("Ollama chat HTTP ${response.code}: ${errorBody.take(400)}")
                        false to "Ollama chat HTTP ${response.code}"
                    }
                }
            }
        }.getOrElse { e ->
            StoryLog.w("Ollama test failed: ${e.message}")
            false to (e.message ?: "Нет сети до $url")
        }
    }

    suspend fun testBackend(apiClient: ApiClient, backendUrl: String): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        runCatching {
            val health = apiClient.fetchHealth(backendUrl)
            val llmProvider = health["llmProvider"]?.toString().orEmpty()
            val localOllama = health["localOllama"] as? Boolean ?: false
            val groq = health["groq"] as? Boolean ?: false
            val openrouter = health["openrouter"] as? Boolean ?: false
            val yandex = health["yandexTts"] as? Boolean ?: false
            when {
                llmProvider == "local" && localOllama ->
                    true to "BFF локальный (Ollama на ПК)"
                (groq || openrouter) && yandex -> true to "Сервер работает"
                groq || openrouter -> true to "Сервер работает (LLM)"
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
        openRouterApiKey: String,
        geminiModelId: String,
        groqModelId: String,
        openRouterModelId: String,
        localOllamaUrl: String = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_URL,
        localOllamaModel: String = SettingsDataStore.DEFAULT_LOCAL_OLLAMA_MODEL,
    ): ConnectionCheckResult {
        StoryLog.i(
            "Connection check: provider=${llmProvider.id} model=${
                when (llmProvider) {
                    LlmProvider.GROQ -> groqModelId
                    LlmProvider.GEMINI -> geminiModelId
                    LlmProvider.OPENROUTER -> openRouterModelId
                    LlmProvider.LOCAL -> localOllamaModel
                }
            }",
        )
        val llmResult = when (llmProvider) {
            LlmProvider.LOCAL -> {
                if (backendUrl.isBlank()) {
                    false to "Укажи URL backend: http://IP_ПК_ZeroTier:3000"
                } else if (!BackendUrlRules.isLanBackend(backendUrl)) {
                    false to BackendUrlRules.localBackendRequiredMessage(backendUrl)
                } else if (localOllamaUrl.isBlank()) {
                    false to "Укажи URL Ollama: http://127.0.0.1:11435 (с ПК с BFF)"
                } else {
                    testLocalOllamaViaBackend(apiClient, backendUrl, localOllamaUrl, localOllamaModel)
                }
            }
            else -> {
                val activeKey = ApiKeySanitizer.clean(
                    when (llmProvider) {
                        LlmProvider.GROQ -> groqApiKey
                        LlmProvider.GEMINI -> geminiApiKey
                        LlmProvider.OPENROUTER -> openRouterApiKey
                        LlmProvider.LOCAL -> ""
                    },
                )
                val modelId = when (llmProvider) {
                    LlmProvider.GROQ -> groqModelId
                    LlmProvider.GEMINI -> geminiModelId
                    LlmProvider.OPENROUTER -> openRouterModelId
                    LlmProvider.LOCAL -> localOllamaModel
                }
                if (backendUrl.isBlank()) {
                    false to "Укажи URL Railway — нейросети из РФ только через сервер"
                } else {
                    testLlmKeyViaBackend(
                        apiClient = apiClient,
                        backendUrl = backendUrl,
                        llmProvider = llmProvider,
                        apiKey = activeKey,
                        modelId = modelId,
                        groqApiKey = groqApiKey,
                        geminiApiKey = geminiApiKey,
                        openRouterApiKey = openRouterApiKey,
                    )
                }
            }
        }

        val backendResult = if (backendUrl.isNotBlank()) {
            testBackend(apiClient, backendUrl)
        } else {
            false to "URL Railway не задан"
        }
        val quota = if (backendResult.first) {
            fetchQuota(apiClient, backendUrl)
        } else {
            null
        }

        return ConnectionCheckResult(
            llmOk = llmResult.first,
            llmMessage = llmResult.second,
            backendOk = backendResult.first,
            backendMessage = backendResult.second,
            quota = quota,
        )
    }
}

data class QuotaResponse(
    val tier: String? = null,
    val premium: Boolean? = null,
    val quota: StoryQuotaInfo? = null,
    val hint: String? = null,
)

data class DevTierRequest(val tier: String?)

data class DevTierResponse(
    val ok: Boolean? = null,
    val tier: String? = null,
    val devTierOverride: String? = null,
    val hint: String? = null,
    val serverLlmKeys: String? = null,
    val error: String? = null,
    val code: String? = null,
)

data class BillingStatusResponse(
    val tier: String? = null,
    val devTierSwitchEnabled: Boolean? = null,
    val devTierOverride: String? = null,
    val hint: String? = null,
)

data class RateLimitErrorBody(
    val error: String? = null,
    val code: String? = null,
    val quota: StoryQuotaInfo? = null,
    val source: String? = null,
)
