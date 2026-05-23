package com.musicstory.app.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object WikipediaFacts {

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    suspend fun fetch(artist: String, title: String, countryCode: String?): List<String> =
        withContext(Dispatchers.IO) {
            val lang = if (countryCode == "RU") "ru" else "en"
            val cleanTitle = title.replace(Regex("\\s*\\([^)]*\\)\\s*"), " ").trim()
            val candidates = listOf(
                "$cleanTitle ($artist song)",
                "$cleanTitle (song)",
                cleanTitle,
                artist,
            ).distinct().filter { it.length > 1 }

            for (candidate in candidates) {
                val summary = fetchSummary(lang, candidate) ?: continue
                val bullets = extractBullets(summary)
                if (bullets.isNotEmpty()) return@withContext bullets
            }
            if (lang == "en") {
                for (candidate in candidates) {
                    val summary = fetchSummary("ru", candidate) ?: continue
                    val bullets = extractBullets(summary)
                    if (bullets.isNotEmpty()) return@withContext bullets
                }
            }
            emptyList()
        }

    private fun fetchSummary(lang: String, title: String): String? {
        return try {
            val encoded = URLEncoder.encode(title.replace(' ', '_'), "UTF-8")
            val request = Request.Builder()
                .url("https://$lang.wikipedia.org/api/rest_v1/page/summary/$encoded")
                .header("User-Agent", "MusicStoryApp/1.0 (Android)")
                .header("Accept", "application/json")
                .get()
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val extract = JSONObject(response.body?.string().orEmpty()).optString("extract", "")
                extract.takeIf { it.length > 40 }
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun extractBullets(text: String): List<String> {
        return text
            .replace(Regex("\\([^)]*\\)"), " ")
            .split(Regex("(?<=[.!?…])\\s+"))
            .map { it.trim() }
            .filter { it.length in 35..220 }
            .filterNot { it.contains(Regex("влия|легендар|уникальн|магия музыки", RegexOption.IGNORE_CASE)) }
            .take(4)
    }
}
