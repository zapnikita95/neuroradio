package com.musicstory.app.data.remote

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.domain.StoryAngle
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.StoryPersona
import com.musicstory.app.domain.StoryPrompts
import com.musicstory.app.domain.StoryScriptQuality
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class GroqStoryClient(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(12, TimeUnit.SECONDS)
        .build(),
    private val gson: Gson = Gson(),
) {

    suspend fun generateStory(
        artist: String,
        title: String,
        year: Int? = null,
        genre: String? = null,
        countryCode: String? = null,
        previousScripts: List<String> = emptyList(),
        angle: StoryAngle = StoryPersona.pickAngle(previousScripts.size),
        storyLength: StoryLength = StoryLength.SEC_30,
        storyNarrator: StoryNarrator = StoryNarrator.AUTO,
        referenceFacts: List<String> = emptyList(),
        apiKey: String? = null,
    ): StoryResponse? = withContext(Dispatchers.IO) {
        val key = apiKey?.trim().orEmpty()
        if (key.isEmpty()) return@withContext null

        val persona = StoryNarrator.buildPersona(storyNarrator, year, genre, artist, title, countryCode)
        val system = StoryPrompts.systemPrompt(persona, storyLength)
        val user = StoryPrompts.userMessage(
            artist, title, year, genre, angle, storyLength, previousScripts, storyNarrator, countryCode, referenceFacts,
        )

        var lastError: IOException? = null
        for (model in StoryPrompts.GROQ_MODELS) {
            try {
                return@withContext requestStory(
                    apiKey = key,
                    model = model,
                    system = system,
                    user = user,
                    storyLength = storyLength,
                    artist = artist,
                    title = title,
                    year = year,
                    genre = genre,
                )
            } catch (e: IOException) {
                lastError = e
                if (isRateLimitError(e) && model != StoryPrompts.GROQ_MODELS.last()) {
                    StoryLog.w("Groq model $model rate-limited, trying fallback")
                    continue
                }
                throw e
            }
        }
        throw lastError ?: IOException("Groq не ответил")
    }

    private fun requestStory(
        apiKey: String,
        model: String,
        system: String,
        user: String,
        storyLength: StoryLength,
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
    ): StoryResponse? {
        val body = JSONObject().apply {
            put("model", model)
            put("temperature", 0.82)
            put("max_tokens", storyLength.maxTokens)
            put("response_format", JSONObject().put("type", "json_object"))
            put(
                "messages",
                org.json.JSONArray().apply {
                    put(JSONObject().put("role", "system").put("content", system))
                    put(JSONObject().put("role", "user").put("content", user))
                },
            )
        }

        val request = Request.Builder()
            .url("https://api.groq.com/openai/v1/chat/completions")
            .header("Content-Type", "application/json")
            .header("Authorization", "Bearer $apiKey")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                val errorBody = response.body?.string()?.take(240).orEmpty()
                throw IOException(
                    if (errorBody.isBlank()) {
                        "Groq HTTP ${response.code}"
                    } else {
                        "Groq HTTP ${response.code}: $errorBody"
                    },
                )
            }
            return parseGroqResponse(response.body?.string(), artist, title, year, genre)
                ?: throw IOException("Groq ответил, но текст истории не разобрался")
        }
    }

    private fun isRateLimitError(error: IOException): Boolean {
        val message = error.message.orEmpty().lowercase()
        return message.contains("429") || message.contains("rate limit")
    }

    private fun parseGroqResponse(
        rawBody: String?,
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
    ): StoryResponse? {
        val payload = gson.fromJson(rawBody, GroqChatResponse::class.java)
        val content = payload.choices?.firstOrNull()?.message?.content ?: return null
        return parseStoryJson(content, artist, title, year, genre)
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
            if (script.isBlank() || StoryScriptQuality.isTemplateLike(script)) return null
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
