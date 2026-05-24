package com.musicstory.app.data.remote

import com.musicstory.app.domain.ReferenceFactBundle
import com.musicstory.app.domain.ReferenceFactQuality
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
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

    suspend fun fetchBundle(artist: String, title: String, countryCode: String?): ReferenceFactBundle =
        withContext(Dispatchers.IO) {
            coroutineScope {
                val track = async { fetchScope(artist, title, countryCode, Scope.TRACK) }
                val artistFacts = async { fetchScope(artist, title, countryCode, Scope.ARTIST) }
                var trackFacts = track.await()
                val artistList = artistFacts.await()
                if (trackFacts.isEmpty()) {
                    val lang = if (countryCode == "RU") "ru" else "en"
                    trackFacts = fetchArtistMentionsForTrack(lang, artist, title)
                    if (trackFacts.isEmpty() && countryCode == "RU") {
                        trackFacts = fetchArtistMentionsForTrack("en", artist, title)
                    }
                }
                ReferenceFactBundle(
                    trackFacts = trackFacts,
                    artistFacts = artistList,
                )
            }
        }

    suspend fun fetch(artist: String, title: String, countryCode: String?): List<String> {
        val bundle = fetchBundle(artist, title, countryCode)
        return (bundle.trackFacts + bundle.artistFacts).distinct().take(6)
    }

    private enum class Scope { TRACK, ARTIST }

    private suspend fun fetchScope(
        artist: String,
        title: String,
        countryCode: String?,
        scope: Scope,
    ): List<String> {
        val lang = if (countryCode == "RU") "ru" else "en"
        val cleanTitle = title.replace(Regex("\\s*\\([^)]*\\)\\s*"), " ").trim()
        val candidates = when (scope) {
            Scope.TRACK -> listOf(
                cleanTitle,
                "$cleanTitle ($artist song)",
            )
            Scope.ARTIST -> listOf(
                "$artist (band)",
                "$artist (musician)",
                artist,
            )
        }.distinct().filter { it.length > 1 }

        val queries = when (scope) {
            Scope.TRACK -> listOf("$cleanTitle $artist song")
            Scope.ARTIST -> listOf("$artist musician")
        }

        val mention = if (scope == Scope.TRACK) title else artist

        for (candidate in candidates) {
            delay(120)
            val bullets = fetchFactsForTitle(lang, candidate, mention)
            if (bullets.isNotEmpty()) return bullets
        }

        for (query in queries) {
            delay(120)
            val foundTitle = searchWikiTitle(lang, query) ?: continue
            if (scope == Scope.ARTIST && foundTitle.contains("disambiguation", ignoreCase = true)) continue
            val bullets = fetchFactsForTitle(lang, foundTitle, mention)
            if (bullets.isNotEmpty()) return bullets
        }

        val fallbackLang = if (lang == "en") "ru" else "en"
        if (countryCode == "RU") {
            for (candidate in candidates.take(1)) {
                delay(120)
                val bullets = fetchFactsForTitle(fallbackLang, candidate, mention)
                if (bullets.isNotEmpty()) return bullets
            }
        }
        return emptyList()
    }

    private fun fetchArtistMentionsForTrack(lang: String, artist: String, title: String): List<String> {
        val candidates = listOf(
            "$artist (band)",
            "$artist (musical group)",
            "$artist (musician)",
            "$artist (singer)",
            artist,
        ).distinct()
        for (candidate in candidates.take(2)) {
            Thread.sleep(120)
            val summary = fetchExtendedExtract(lang, candidate, 28) ?: fetchSummary(lang, candidate) ?: continue
            if (isDisambiguation(summary)) continue
            val mentions = ReferenceFactQuality.filterAndRank(
                extractSentencesMentioning(summary, title).filterNot { isWeakFact(it) },
                max = 4,
            )
            if (mentions.isNotEmpty()) return mentions
        }
        return emptyList()
    }

    private fun fetchFactsForTitle(lang: String, title: String, mention: String): List<String> {
        val summary = fetchExtendedExtract(lang, title) ?: fetchSummary(lang, title) ?: return emptyList()
        if (isDisambiguation(summary)) return emptyList()
        val bullets = extractBullets(summary).filterNot { ReferenceFactQuality.isBoringFact(it) }
        if (bullets.isNotEmpty()) return ReferenceFactQuality.filterAndRank(bullets)
        return ReferenceFactQuality.filterAndRank(
            extractSentencesMentioning(summary, mention).filterNot { isWeakFact(it) },
        )
    }

    private fun isDisambiguation(text: String): Boolean =
        text.contains(Regex("may refer to|most commonly refers to|disambiguation page|can refer to", RegexOption.IGNORE_CASE))

    private fun isWeakFact(sentence: String): Boolean =
        sentence.contains(Regex("may refer to|most commonly refers to|Queen regnant|Queen consort|disambiguation", RegexOption.IGNORE_CASE)) ||
            ReferenceFactQuality.isBoringFact(sentence)

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

    private fun fetchExtendedExtract(lang: String, title: String, sentences: Int = 24): String? {
        return try {
            val encodedTitle = URLEncoder.encode(title.replace(' ', '_'), "UTF-8")
            val url =
                "https://$lang.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1" +
                    "&exsentences=$sentences&format=json&origin=*&titles=$encodedTitle"
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "MusicStoryApp/1.0 (Android)")
                .header("Accept", "application/json")
                .get()
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return null
                val pages = JSONObject(response.body?.string().orEmpty())
                    .optJSONObject("query")
                    ?.optJSONObject("pages") ?: return null
                val pageKey = pages.keys().asSequence().firstOrNull() ?: return null
                val extract = pages.optJSONObject(pageKey)?.optString("extract", "").orEmpty()
                extract.takeIf { it.length > 40 }
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
            .filter { it.length in 35..240 }
            .filterNot { isDisambiguation(it) }
            .filterNot { it.contains(Regex("влия|легендар|уникальн|магия музыки", RegexOption.IGNORE_CASE)) }
            .sortedByDescending { ReferenceFactQuality.interestScore(it) }
            .take(12)
    }

    private fun extractSentencesMentioning(text: String, needle: String): List<String> {
        val normalizedNeedle = normalize(needle)
        val tokens = normalizedNeedle.split(' ').filter { it.length >= 3 }
        if (tokens.isEmpty()) return emptyList()

        return text
            .replace(Regex("\\([^)]*\\)"), " ")
            .split(Regex("(?<=[.!?…])\\s+"))
            .map { it.trim() }
            .filter { it.length in 35..240 }
            .filter { sentence ->
                val lower = normalize(sentence)
                if (normalizedNeedle.length >= 8 && lower.contains(normalizedNeedle)) return@filter true
                val hits = tokens.count { lower.contains(it) }
                val threshold = if (tokens.size <= 2) 1 else minOf(2, tokens.size)
                hits >= threshold
            }
            .take(8)
    }

    private fun normalize(text: String): String =
        text.lowercase().replace(Regex("[^\\p{L}\\p{N}\\s]"), " ").replace(Regex("\\s+"), " ").trim()
}
