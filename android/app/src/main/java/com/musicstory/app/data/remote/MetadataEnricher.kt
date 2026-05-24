package com.musicstory.app.data.remote

import com.musicstory.app.domain.ReferenceFactBundle
import com.musicstory.app.domain.ReferenceFactPicker
import com.musicstory.app.domain.TrackLocaleResolver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

data class TrackMetadata(
    val year: Int? = null,
    val genre: String? = null,
    val countryCode: String? = null,
    val recordingMbid: String? = null,
    val artistMbid: String? = null,
    val factBundle: ReferenceFactBundle = ReferenceFactBundle(),
    val referenceFacts: List<String> = emptyList(),
)

class MetadataEnricher(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build(),
) {
    suspend fun enrich(artist: String, title: String): TrackMetadata = enrichInternal(artist, title)

    internal suspend fun enrichInternal(artist: String, title: String): TrackMetadata = withContext(Dispatchers.IO) {
        try {
            val query = URLEncoder.encode("artist:\"$artist\" AND recording:\"$title\"", Charsets.UTF_8.name())
            val url = "https://musicbrainz.org/ws/2/recording?query=$query&fmt=json&limit=3&inc=artist-credits"
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "MusicStoryApp/1.0 (Android)")
                .get()
                .build()
            val response = client.newCall(request).execute()
            if (!response.isSuccessful) return@withContext fallbackFactsOnly(artist, title, null)

            val json = JSONObject(response.body?.string().orEmpty())
            val recordings = json.optJSONArray("recordings") ?: return@withContext fallbackFactsOnly(artist, title, null)
            if (recordings.length() == 0) return@withContext fallbackFactsOnly(artist, title, null)

            val rec = recordings.getJSONObject(0)
            val year = extractYear(rec)
            val genre = extractGenre(rec)
            val recordingMbid = rec.optString("id").takeIf { it.isNotBlank() }
            val artistMbid = extractArtistMbid(rec)
            val countryCode = ArtistCountryResolver.resolve(artist, extractCountry(rec))
                ?: TrackLocaleResolver.inferCountryFromText(artist, title)
            buildMetadata(artist, title, countryCode, year, genre, recordingMbid, artistMbid)
        } catch (_: Exception) {
            fallbackFactsOnly(artist, title, null)
        }
    }

    private suspend fun fallbackFactsOnly(
        artist: String,
        title: String,
        countryCode: String?,
    ): TrackMetadata {
        val code = countryCode
            ?: ArtistCountryResolver.resolve(artist, null)
            ?: TrackLocaleResolver.inferCountryFromText(artist, title)
        return buildMetadata(artist, title, code, null, null, null, null)
    }

    private suspend fun buildMetadata(
        artist: String,
        title: String,
        countryCode: String?,
        year: Int?,
        genre: String?,
        recordingMbid: String?,
        artistMbid: String?,
    ): TrackMetadata {
        val factBundle = FactAggregator.fetchBundle(artist, title, countryCode, recordingMbid, artistMbid)
        val selected = ReferenceFactPicker.pick(factBundle, emptyList())
        val facts = ReferenceFactPicker.factsForPrompt(selected)
            .ifEmpty { (factBundle.trackFacts + factBundle.artistFacts).take(4) }
        return TrackMetadata(
            year = year,
            genre = genre,
            countryCode = countryCode,
            recordingMbid = recordingMbid,
            artistMbid = artistMbid,
            factBundle = factBundle,
            referenceFacts = facts,
        )
    }

    private fun extractArtistMbid(rec: JSONObject): String? {
        val credits = rec.optJSONArray("artist-credit") ?: return null
        for (i in 0 until credits.length()) {
            val artistObj = credits.optJSONObject(i)?.optJSONObject("artist") ?: continue
            val id = artistObj.optString("id").trim()
            if (id.isNotEmpty()) return id
        }
        return null
    }

    private fun extractCountry(rec: JSONObject): String? {
        val credits = rec.optJSONArray("artist-credit") ?: return null
        for (i in 0 until credits.length()) {
            val artistObj = credits.optJSONObject(i)?.optJSONObject("artist") ?: continue
            val country = artistObj.optString("country", "").trim().uppercase()
            if (country.length == 2) return country
        }
        return null
    }

    private fun extractYear(rec: JSONObject): Int? {
        val date = rec.optString("first-release-date", "")
        val match = Regex("(\\d{4})").find(date) ?: return null
        return match.groupValues[1].toIntOrNull()
    }

    private fun extractGenre(rec: JSONObject): String? {
        val tags = rec.optJSONArray("tags") ?: return null
        if (tags.length() == 0) return null
        var best: JSONObject? = null
        var bestCount = -1
        for (i in 0 until tags.length()) {
            val tag = tags.getJSONObject(i)
            val count = tag.optInt("count", 0)
            if (count > bestCount) {
                bestCount = count
                best = tag
            }
        }
        return best?.optString("name")?.takeIf { it.isNotBlank() }
    }
}
