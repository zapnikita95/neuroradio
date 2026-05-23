package com.musicstory.app.data.remote

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.domain.StoryAngle
import com.musicstory.app.domain.StoryPersona
import com.musicstory.app.domain.StoryPrompts
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class GroqStoryClient(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(12, TimeUnit.SECONDS)
        .build(),
    private val gson: Gson = Gson(),
) {

    /**
     * @param backendProxyUrl Railway/backend base URL — Groq вызывается через сервер (обход геоблока)
     * @param backendProxySecret optional PROXY_SECRET from server env
     * @param apiKey direct Groq key — только если прокси не используется
     */
    suspend fun generateStory(
        artist: String,
        title: String,
        year: Int? = null,
        genre: String? = null,
        previousScripts: List<String> = emptyList(),
        angle: StoryAngle = StoryPersona.pickAngle(previousScripts.size),
        apiKey: String? = null,
        backendProxyUrl: String? = null,
        backendProxySecret: String? = null,
    ): StoryResponse? = withContext(Dispatchers.IO) {
        val persona = StoryPersona.forTrack(year, genre, artist)
        val system = StoryPrompts.systemPrompt(persona)
        val user = StoryPrompts.userMessage(artist, title, year, genre, angle, previousScripts)

        val body = JSONObject().apply {
            put("model", StoryPrompts.GROQ_MODEL)
            put("temperature", 0.92)
            put("max_tokens", 450)
            put("response_format", JSONObject().put("type", "json_object"))
            put(
                "messages",
                org.json.JSONArray().apply {
                    put(JSONObject().put("role", "system").put("content", system))
                    put(JSONObject().put("role", "user").put("content", user))
                },
            )
        }

        val proxyBase = backendProxyUrl?.trim()?.trimEnd('/')
        val useProxy = !proxyBase.isNullOrBlank()

        val requestBuilder = Request.Builder()
            .header("Content-Type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))

        if (useProxy) {
            requestBuilder.url("$proxyBase/v1/groq/chat/completions")
            backendProxySecret?.trim()?.takeIf { it.isNotEmpty() }?.let { secret ->
                requestBuilder.header("X-Music-Story-Secret", secret)
            }
        } else {
            val key = apiKey?.trim().orEmpty()
            if (key.isEmpty()) return@withContext null
            requestBuilder
                .url("https://api.groq.com/openai/v1/chat/completions")
                .header("Authorization", "Bearer $key")
        }

        val response = client.newCall(requestBuilder.build()).execute()
        if (!response.isSuccessful) return@withContext null

        val payload = gson.fromJson(response.body?.string(), GroqChatResponse::class.java)
        val content = payload.choices?.firstOrNull()?.message?.content ?: return@withContext null
        parseStoryJson(content, artist, title, year, genre)
    }

    private fun parseStoryJson(
        raw: String,
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
    ): StoryResponse? {
        val jsonStart = raw.indexOf('{')
        val jsonEnd = raw.lastIndexOf('}')
        if (jsonStart < 0 || jsonEnd <= jsonStart) return null

        return try {
            val obj = JSONObject(raw.substring(jsonStart, jsonEnd + 1))
            val script = obj.getString("script").trim()
            if (script.isBlank()) return null
            StoryResponse(
                artist = artist,
                title = title,
                year = year,
                genre = genre,
                script = script,
                wordCount = countWords(script),
                demo = false,
                audioUrl = null,
                sources = com.musicstory.app.data.model.StorySources(groq = true),
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun countWords(text: String): Int =
        text.trim().split(Regex("\\s+")).count { it.isNotEmpty() }

    private data class GroqChatResponse(val choices: List<GroqChoice>? = null)
    private data class GroqChoice(val message: GroqMessage? = null)
    private data class GroqMessage(
        val content: String? = null,
        @SerializedName("role") val role: String? = null,
    )
}
