package com.musicstory.app.data.remote

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.domain.SelectedReferenceFact
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
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
        storyLength: StoryLength = StoryLength.SEC_30,
        storyNarrator: StoryNarrator = StoryNarrator.AUTO,
        referenceFacts: List<String> = emptyList(),
        selectedFact: SelectedReferenceFact? = null,
        apiKey: String? = null,
    ): StoryResponse? = withContext(Dispatchers.IO) {
        val key = apiKey?.trim().orEmpty()
        if (key.isEmpty()) return@withContext null

        val persona = StoryNarrator.buildPersona(storyNarrator, year, genre, artist, title, countryCode)
        val system = StoryPrompts.systemPrompt(persona, storyLength)
        val baseUser = StoryPrompts.userMessage(
            artist, title, year, genre, storyLength, previousScripts, storyNarrator, countryCode, referenceFacts, selectedFact,
        )

        var lastRejectReason = "quality filter"
        repeat(MAX_ATTEMPTS) { attempt ->
            val strictAnchor = referenceFacts.isNotEmpty() || attempt < MAX_ATTEMPTS - 1
            val user = if (attempt == 0) {
                baseUser
            } else {
                "$baseUser\n\nПерегенерируй: предыдущий ответ отклонён ($lastRejectReason). Только русский текст, без английских слов вне «$artist»/«$title», опирайся на семя факта."
            }
            try {
                val story = requestStory(
                    apiKey = key,
                    model = StoryPrompts.GROQ_MODEL_PRIMARY,
                    system = system,
                    user = user,
                    storyLength = storyLength,
                    artist = artist,
                    title = title,
                    year = year,
                    genre = genre,
                    referenceFacts = referenceFacts,
                    countryCode = countryCode,
                    strictReferenceAnchor = strictAnchor,
                )
                if (story != null) return@withContext story
                lastRejectReason = "шаблон или слабый факт"
                StoryLog.w("Groq story rejected (attempt ${attempt + 1}/$MAX_ATTEMPTS)")
            } catch (e: IOException) {
                if (GroqErrorParser.isNonRetryable(e.message.orEmpty())) throw e
                if (GroqErrorParser.isJsonModeFailure(e.message.orEmpty())) {
                    lastRejectReason = "формат JSON"
                    StoryLog.w("Groq JSON mode failed (attempt ${attempt + 1}/$MAX_ATTEMPTS)")
                    return@repeat
                }
                StoryLog.w("Groq request failed (attempt ${attempt + 1}/$MAX_ATTEMPTS): ${e.message}")
                throw e
            }
        }
        StoryLog.w("Groq story rejected after $MAX_ATTEMPTS attempts")
        throw IOException(STORY_RETRY_MESSAGE)
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
        referenceFacts: List<String>,
        countryCode: String?,
        strictReferenceAnchor: Boolean = true,
    ): StoryResponse? {
        val jsonModeStory = callGroq(
            apiKey, model, system, user, storyLength, artist, title, year, genre,
            referenceFacts, countryCode, strictReferenceAnchor, useJsonMode = true,
        )
        if (jsonModeStory != null) return jsonModeStory

        StoryLog.w("Groq JSON mode empty/failed — retry without response_format")
        return callGroq(
            apiKey, model, system, user, storyLength, artist, title, year, genre,
            referenceFacts, countryCode, strictReferenceAnchor, useJsonMode = false,
        )
    }

    private fun callGroq(
        apiKey: String,
        model: String,
        system: String,
        user: String,
        storyLength: StoryLength,
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
        referenceFacts: List<String>,
        countryCode: String?,
        strictReferenceAnchor: Boolean,
        useJsonMode: Boolean,
    ): StoryResponse? {
        val body = JSONObject().apply {
            put("model", model)
            put("temperature", if (useJsonMode) 0.72 else 0.65)
            put("max_tokens", storyLength.maxTokens)
            if (useJsonMode) {
                put("response_format", JSONObject().put("type", "json_object"))
            }
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
            val rawBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                if (useJsonMode && response.code == 400) {
                    extractFailedGeneration(rawBody)?.let { failed ->
                        parseStoryJson(
                            failed, artist, title, year, genre, referenceFacts, countryCode, strictReferenceAnchor,
                        )?.let { return it }
                    }
                    return null
                }
                throw IOException(
                    if (rawBody.isBlank()) "Groq HTTP ${response.code}"
                    else GroqApiErrorParser.parse(response.code, rawBody),
                )
            }
            return parseGroqResponse(
                rawBody, artist, title, year, genre, referenceFacts, countryCode, strictReferenceAnchor,
            )
        }
    }

    private fun extractFailedGeneration(errorBody: String): String? {
        if (errorBody.isBlank()) return null
        return try {
            val root = JSONObject(errorBody)
            val error = root.optJSONObject("error") ?: return null
            error.optString("failed_generation").takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }

    private fun parseGroqResponse(
        rawBody: String?,
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
        referenceFacts: List<String>,
        countryCode: String?,
        strictReferenceAnchor: Boolean = true,
    ): StoryResponse? {
        val payload = gson.fromJson(rawBody, GroqChatResponse::class.java)
        val content = payload.choices?.firstOrNull()?.message?.content ?: return null
        return parseStoryJson(content, artist, title, year, genre, referenceFacts, countryCode, strictReferenceAnchor)
    }

    private fun parseStoryJson(
        raw: String,
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
        referenceFacts: List<String>,
        countryCode: String?,
        strictReferenceAnchor: Boolean = true,
    ): StoryResponse? {
        val jsonStart = raw.indexOf('{')
        val jsonEnd = raw.lastIndexOf('}')
        if (jsonStart < 0 || jsonEnd <= jsonStart) return null

        return try {
            val obj = JSONObject(raw.substring(jsonStart, jsonEnd + 1))
            val script = obj.getString("script").trim()
            if (script.isBlank()) return null
            if (StoryScriptQuality.hasBannedPattern(script)) return null
            if (StoryScriptQuality.isTemplateLike(
                    script,
                    artist,
                    title,
                    referenceFacts,
                    countryCode,
                    year,
                    strictReferenceAnchor = strictReferenceAnchor,
                )
            ) return null
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

    companion object {
        private const val MAX_ATTEMPTS = 3
        const val STORY_RETRY_MESSAGE =
            "Не получилось собрать историю — нажми «Рассказать историю» ещё раз."
    }
}
