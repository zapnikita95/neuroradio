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
                "$cleanTitle by $artist",
                cleanTitle,
                "$artist $cleanTitle",
                artist,
            ).distinct().filter { it.length > 1 }

            for (candidate in candidates) {
                val bullets = fetchFactsForTitle(lang, candidate, title)
                if (bullets.isNotEmpty()) return@withContext bullets
            }

            for (query in listOf(
                "$cleanTitle $artist song",
                "$cleanTitle song $artist",
                "$artist $cleanTitle",
                "$artist musician",
            )) {
                val foundTitle = searchWikiTitle(lang, query) ?: continue
                val bullets = fetchFactsForTitle(lang, foundTitle, title)
                if (bullets.isNotEmpty()) return@withContext bullets
            }

            if (lang == "en") {
                for (candidate in candidates) {
                    val bullets = fetchFactsForTitle("ru", candidate, title)
                    if (bullets.isNotEmpty()) return@withContext bullets
                }
            }
            emptyList()
        }

    private fun fetchFactsForTitle(lang: String, title: String, songTitle: String): List<String> {
        val summary = fetchSummary(lang, title) ?: return emptyList()
        val bullets = extractBullets(summary)
        if (bullets.isNotEmpty()) return bullets
        return extractSentencesMentioning(summary, songTitle)
    }

    private fun searchWikiTitle(lang: String, query: String): String? {
        return try {
            val url =
                "https://$lang.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*" +
                    "&srlimit=5&srsearch=${URLEncoder.encode(query, "UTF-8")}"
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "MusicStoryApp/1.0 (Android)")
                .header("Accept", "application/json")
                .get()
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val search = JSONObject(response.body?.string().orEmpty())
                    .optJSONObject("query")
                    ?.optJSONArray("search")
                search?.optJSONObject(0)?.optString("title")?.takeIf { it.isNotBlank() }
            }
        } catch (_: Exception) {
            null
        }
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

    private fun extractSentencesMentioning(text: String, needle: String): List<String> {
        val tokens = needle
            .lowercase()
            .replace(Regex("[^\\p{L}\\p{N}\\s]"), " ")
            .split(Regex("\\s+"))
            .filter { it.length >= 4 }
        if (tokens.isEmpty()) return emptyList()

        return text
            .replace(Regex("\\([^)]*\\)"), " ")
            .split(Regex("(?<=[.!?…])\\s+"))
            .map { it.trim() }
            .filter { it.length in 35..220 }
            .filter { sentence ->
                val lower = sentence.lowercase()
                tokens.count { lower.contains(it) } >= minOf(2, tokens.size)
            }
            .take(3)
    }
}
