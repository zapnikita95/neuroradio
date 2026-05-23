package com.musicstory.app.data.remote

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.domain.StoryAngle
import com.musicstory.app.domain.StoryPersona
import com.musicstory.app.domain.StoryPrompts
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

    /** Direct Groq only — backend proxy removed for security (no open LLM relay). */
    suspend fun generateStory(
        artist: String,
        title: String,
        year: Int? = null,
        genre: String? = null,
        previousScripts: List<String> = emptyList(),
        angle: StoryAngle = StoryPersona.pickAngle(previousScripts.size),
        apiKey: String? = null,
    ): StoryResponse? {
        val key = apiKey?.trim().orEmpty()
        if (key.isEmpty()) return null

        val persona = StoryPersona.forTrack(year, genre, artist)
        val system = StoryPrompts.systemPrompt(persona)
        val user = StoryPrompts.userMessage(artist, title, year, genre, angle, previousScripts)

        val body = JSONObject().apply {
            put("model", StoryPrompts.GROQ_MODEL)
            put("temperature", 0.82)
            put("max_tokens", 650)
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
            .header("Authorization", "Bearer $key")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) return null

        return parseGroqResponse(response.body?.string(), artist, title, year, genre)
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
