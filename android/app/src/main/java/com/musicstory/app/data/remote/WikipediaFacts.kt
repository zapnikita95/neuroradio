package com.musicstory.app.data.remote

import com.musicstory.app.domain.ReferenceFactBundle
import com.musicstory.app.domain.ReferenceFactQuality
import kotlinx.coroutines.Dispatchers
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
            val lang = if (countryCode == "RU") "ru" else "en"
            var trackFacts = fetchArtistMentionsForTrack(lang, artist, title)
            if (trackFacts.isEmpty() && countryCode == "RU") {
                trackFacts = fetchArtistMentionsForTrack("en", artist, title)
            }
            if (trackFacts.isEmpty()) {
                trackFacts = fetchScope(artist, title, countryCode, Scope.TRACK)
            }
            val artistList = fetchScope(artist, title, countryCode, Scope.ARTIST)
            ReferenceFactBundle(
                trackFacts = trackFacts,
                artistFacts = artistList,
            )
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
                "$cleanTitle (song)",
            )
            Scope.ARTIST -> listOf(
                artist,
                "$artist (musician)",
                "$artist (singer)",
                "$artist (band)",
            )
        }.distinct().filter { it.length > 1 }

        val queries = when (scope) {
            Scope.TRACK -> listOf("$cleanTitle $artist song", "$cleanTitle song", "$artist $cleanTitle")
            Scope.ARTIST -> listOf("$artist musician", artist)
        }

        val mention = if (scope == Scope.TRACK) title else artist

        for (candidate in candidates) {
            delay(120)
            val bullets = fetchFactsForTitle(lang, candidate, mention, trackContext = scope == Scope.TRACK)
            if (bullets.isNotEmpty()) return bullets
        }

        for (query in queries) {
            delay(120)
            val foundTitle = searchWikiTitle(lang, query) ?: continue
            if (scope == Scope.ARTIST && foundTitle.contains("disambiguation", ignoreCase = true)) continue
            val bullets = fetchFactsForTitle(lang, foundTitle, mention, trackContext = scope == Scope.TRACK)
            if (bullets.isNotEmpty()) return bullets
        }

        if (countryCode == "RU") {
            return fetchScopeEnFallback(artist, title, scope, mention)
        }
        return emptyList()
    }

    private suspend fun fetchScopeEnFallback(
        artist: String,
        title: String,
        scope: Scope,
        mention: String,
    ): List<String> {
        val cleanTitle = title.replace(Regex("\\s*\\([^)]*\\)\\s*"), " ").trim()
        val candidates = when (scope) {
            Scope.TRACK -> listOf(cleanTitle, "$cleanTitle ($artist song)", "$cleanTitle (song)")
            Scope.ARTIST -> listOf(artist, "$artist (musician)", "$artist (singer)")
        }.distinct()
        val queries = when (scope) {
            Scope.TRACK -> listOf("$cleanTitle $artist song", "$cleanTitle song")
            Scope.ARTIST -> listOf("$artist musician", artist)
        }
        for (candidate in candidates) {
            delay(120)
            val bullets = fetchFactsForTitle("en", candidate, mention, trackContext = scope == Scope.TRACK)
            if (bullets.isNotEmpty()) return bullets
        }
        for (query in queries) {
            delay(120)
            val foundTitle = searchWikiTitle("en", query) ?: continue
            val bullets = fetchFactsForTitle("en", foundTitle, mention, trackContext = scope == Scope.TRACK)
            if (bullets.isNotEmpty()) return bullets
        }
        return emptyList()
    }

    private fun fetchArtistMentionsForTrack(lang: String, artist: String, title: String): List<String> {
        val titlesToTry = linkedSetOf<String>()
        searchWikiTitle(lang, "$artist musician")?.let { titlesToTry.add(it) }
        listOf(artist, "$artist (musician)", "$artist (singer)", "$artist (band)").forEach { titlesToTry.add(it) }
        for (candidate in titlesToTry) {
            Thread.sleep(120)
            val summary = fetchFullExtract(lang, candidate) ?: fetchSummary(lang, candidate) ?: continue
            if (isDisambiguation(summary)) continue
            val mentions = ReferenceFactQuality.filterAndRank(
                extractTrackContextFacts(summary, title).filterNot { isWeakFact(it) },
                max = 6,
            )
            if (mentions.isNotEmpty()) return mentions
        }
        return emptyList()
    }

    private fun fetchFactsForTitle(
        lang: String,
        title: String,
        mention: String,
        trackContext: Boolean = false,
    ): List<String> {
        val summary = fetchFullExtract(lang, title) ?: fetchSummary(lang, title) ?: return emptyList()
        if (isDisambiguation(summary)) return emptyList()
        val bullets = extractBullets(summary).filterNot { ReferenceFactQuality.isBoringFact(it) }
        if (bullets.isNotEmpty()) return ReferenceFactQuality.filterAndRank(bullets)
        if (trackContext) {
            val contextual = ReferenceFactQuality.filterAndRank(
                extractTrackContextFacts(summary, mention).filterNot { isWeakFact(it) },
            )
            if (contextual.isNotEmpty()) return contextual
        }
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

    private fun fetchFullExtract(lang: String, title: String): String? {
        return try {
            val encodedTitle = URLEncoder.encode(title.replace(' ', '_'), "UTF-8")
            val url =
                "https://$lang.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1" +
                    "&format=json&origin=*&titles=$encodedTitle"
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

    private fun normalizeWikiText(text: String): String =
        text
            .replace(Regex("(?m)^=+\\s*.+?\\s*=+\\s*$"), " ")
            .replace(Regex("\\s=+\\s*[^=\\n]+?\\s*=+\\s*"), " ")
            .replace(Regex("\\(\\d{4}[^)]{0,120}\\)"), " ")
            .replace(Regex("\\[[^\\]]{0,120}\\]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun splitWikiSentences(text: String): List<String> =
        normalizeWikiText(text)
            .split(Regex("(?<=[.!?…])\\s+"))
            .map { it.trim() }
            .filter { it.length in 35..360 }

    private fun extractBullets(text: String): List<String> =
        splitWikiSentences(text)
            .filterNot { isDisambiguation(it) }
            .filterNot { it.contains(Regex("влия|легендар|уникальн|магия музыки", RegexOption.IGNORE_CASE)) }
            .sortedByDescending { ReferenceFactQuality.interestScore(it) }
            .take(12)

    private fun sentenceMentions(sentence: String, needle: String): Boolean {
        val normalizedNeedle = normalize(needle)
        val tokens = normalizedNeedle.split(' ').filter { it.length >= 3 }
        if (tokens.isEmpty()) return false
        val lower = normalize(sentence)
        if (normalizedNeedle.length >= 4 && lower.contains(normalizedNeedle)) return true
        val hits = tokens.count { lower.contains(it) }
        val threshold = if (tokens.size <= 2) 1 else minOf(2, tokens.size)
        return hits >= threshold
    }

    private fun extractTrackContextFacts(text: String, title: String, contextAfter: Int = 2): List<String> {
        val sentences = splitWikiSentences(text)
        val indices = linkedSetOf<Int>()
        sentences.forEachIndexed { index, sentence ->
            if (!sentenceMentions(sentence, title)) return@forEachIndexed
            indices.add(index)
            for (offset in 1..contextAfter) {
                if (index + offset < sentences.size) indices.add(index + offset)
            }
        }
        return indices.sorted().map { sentences[it] }
    }

    private fun extractSentencesMentioning(text: String, needle: String): List<String> =
        splitWikiSentences(text).filter { sentenceMentions(it, needle) }.take(8)

    private fun normalize(text: String): String =
        text.lowercase().replace(Regex("[^\\p{L}\\p{N}\\s]"), " ").replace(Regex("\\s+"), " ").trim()
}
