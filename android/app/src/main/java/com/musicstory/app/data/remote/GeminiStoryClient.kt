package com.musicstory.app.data.remote

import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.domain.GeminiModel
import com.musicstory.app.domain.SelectedReferenceFact
import com.musicstory.app.domain.StoryAngle
import com.musicstory.app.domain.StoryLength
import com.musicstory.app.domain.StoryNarrator
import com.musicstory.app.domain.StoryPersona
import com.musicstory.app.domain.StoryPrompts
import com.musicstory.app.domain.StoryRussianLanguage
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

class GeminiStoryClient(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(12, TimeUnit.SECONDS)
        .build(),
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
        selectedFact: SelectedReferenceFact? = null,
        apiKey: String? = null,
        geminiModel: GeminiModel = GeminiModel.defaultRecommended,
    ): StoryResponse? = withContext(Dispatchers.IO) {
        val key = apiKey?.trim().orEmpty()
        if (key.isEmpty()) return@withContext null

        val persona = StoryNarrator.buildPersona(storyNarrator, year, genre, artist, title, countryCode)
        val system = StoryPrompts.systemPrompt(persona, storyLength)
        val baseUser = StoryPrompts.userMessage(
            artist, title, year, genre, angle, storyLength, previousScripts, storyNarrator, countryCode, referenceFacts, selectedFact,
        )

        var lastRejectReason = "quality filter"
        repeat(MAX_ATTEMPTS) { attempt ->
            val strictAnchor = attempt < MAX_ATTEMPTS - 1
            val acceptSoftQuality = attempt == MAX_ATTEMPTS - 1
            val user = if (attempt == 0) {
                baseUser
            } else {
                "$baseUser\n\nПерегенерируй: предыдущий ответ отклонён ($lastRejectReason). Только русский текст, без английских слов вне «$artist»/«$title», опирайся на семя факта."
            }
            try {
                val story = requestStory(
                    apiKey = key,
                    model = geminiModel.id,
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
                    acceptSoftQuality = acceptSoftQuality,
                )
                if (story != null) return@withContext story
                lastRejectReason = "шаблон или слабый факт"
                StoryLog.w("Gemini story rejected (attempt ${attempt + 1}/$MAX_ATTEMPTS)")
            } catch (e: IOException) {
                if (GroqErrorParser.isNonRetryable(e.message.orEmpty())) throw e
                StoryLog.w("Gemini request failed (attempt ${attempt + 1}/$MAX_ATTEMPTS): ${e.message}")
                if (attempt == MAX_ATTEMPTS - 1) throw e
            }
        }
        StoryLog.w("Gemini story rejected after $MAX_ATTEMPTS attempts")
        throw IOException(GroqStoryClient.STORY_RETRY_MESSAGE)
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
        acceptSoftQuality: Boolean = false,
    ): StoryResponse? {
        runCatching {
            callGemini(
                apiKey, model, system, user, storyLength, artist, title, year, genre,
                referenceFacts, countryCode, strictReferenceAnchor, acceptSoftQuality, useJsonMode = true,
            )
        }.getOrNull()?.let { return it }

        StoryLog.w("Gemini JSON mode failed for $model — retry without responseMimeType")
        return runCatching {
            callGemini(
                apiKey, model, system, user, storyLength, artist, title, year, genre,
                referenceFacts, countryCode, strictReferenceAnchor, acceptSoftQuality, useJsonMode = false,
            )
        }.getOrNull()
    }

    private fun callGemini(
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
        acceptSoftQuality: Boolean,
        useJsonMode: Boolean,
    ): StoryResponse? {
        val generationConfig = JSONObject().apply {
            put("temperature", if (useJsonMode) 0.72 else 0.65)
            put("maxOutputTokens", storyLength.maxTokens)
            if (useJsonMode) {
                put("responseMimeType", "application/json")
            }
            if (model.startsWith("gemini-2.5")) {
                put("thinkingConfig", JSONObject().put("thinkingBudget", 0))
            }
        }

        val body = JSONObject().apply {
            put("system_instruction", JSONObject().put("parts", org.json.JSONArray().apply {
                put(JSONObject().put("text", system))
            }))
            put("contents", org.json.JSONArray().apply {
                put(JSONObject().apply {
                    put("role", "user")
                    put("parts", org.json.JSONArray().apply {
                        put(JSONObject().put("text", user))
                    })
                })
            })
            put("generationConfig", generationConfig)
        }

        val url = "$GEMINI_API_BASE/$model:generateContent?key=${java.net.URLEncoder.encode(apiKey, "UTF-8")}"
        val request = Request.Builder()
            .url(url)
            .header("Content-Type", "application/json")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        client.newCall(request).execute().use { response ->
            val rawBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException(
                    if (rawBody.isBlank()) "Gemini HTTP ${response.code}"
                    else GeminiErrorParser.parse(response.code, rawBody),
                )
            }
            return parseGeminiResponse(
                rawBody, artist, title, year, genre, referenceFacts, countryCode,
                strictReferenceAnchor, acceptSoftQuality,
            )
        }
    }

    private fun parseGeminiResponse(
        rawBody: String?,
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
        referenceFacts: List<String>,
        countryCode: String?,
        strictReferenceAnchor: Boolean = true,
        acceptSoftQuality: Boolean = false,
    ): StoryResponse? {
        val content = extractGeminiText(rawBody) ?: return null
        return parseStoryJson(
            content, artist, title, year, genre, referenceFacts, countryCode,
            strictReferenceAnchor, acceptSoftQuality,
        )
    }

    private fun extractGeminiText(rawBody: String?): String? {
        if (rawBody.isNullOrBlank()) return null
        return try {
            val root = JSONObject(rawBody)
            root.optJSONArray("candidates")
                ?.optJSONObject(0)
                ?.optJSONObject("content")
                ?.optJSONArray("parts")
                ?.optJSONObject(0)
                ?.optString("text")
                ?.takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
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
        acceptSoftQuality: Boolean = false,
    ): StoryResponse? {
        val jsonStart = raw.indexOf('{')
        val jsonEnd = raw.lastIndexOf('}')
        if (jsonStart < 0 || jsonEnd <= jsonStart) return null

        return try {
            val obj = JSONObject(raw.substring(jsonStart, jsonEnd + 1))
            val script = obj.getString("script").trim()
            if (script.isBlank()) return null
            if (StoryScriptQuality.hasBannedPattern(script)) return null
            if (!passesQualityGate(
                    script,
                    artist,
                    title,
                    referenceFacts,
                    countryCode,
                    year,
                    strictReferenceAnchor,
                    acceptSoftQuality,
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
                sources = com.musicstory.app.data.model.StorySources(groq = false),
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun countWords(text: String): Int =
        text.trim().split(Regex("\\s+")).count { it.isNotEmpty() }

    private fun passesQualityGate(
        script: String,
        artist: String,
        title: String,
        referenceFacts: List<String>,
        countryCode: String?,
        year: Int?,
        strictReferenceAnchor: Boolean,
        acceptSoftQuality: Boolean,
    ): Boolean {
        if (StoryRussianLanguage.hasEnglishLeak(script, artist, title)) return false
        if (acceptSoftQuality) return true
        return !StoryScriptQuality.isTemplateLike(
            script,
            artist,
            title,
            referenceFacts,
            countryCode,
            year,
            strictReferenceAnchor = strictReferenceAnchor,
        )
    }

    companion object {
        private const val MAX_ATTEMPTS = 3
        private const val GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
    }
}
