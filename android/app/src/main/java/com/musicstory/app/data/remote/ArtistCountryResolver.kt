package com.musicstory.app.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

object ArtistCountryResolver {

    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    private val nationalityToCode = mapOf(
        "american" to "US",
        "british" to "GB",
        "english" to "GB",
        "scottish" to "GB",
        "welsh" to "GB",
        "irish" to "IE",
        "canadian" to "CA",
        "australian" to "AU",
        "swedish" to "SE",
        "german" to "DE",
        "french" to "FR",
        "russian" to "RU",
        "ukrainian" to "UA",
        "mexican" to "MX",
        "jamaican" to "JM",
        "japanese" to "JP",
        "korean" to "KR",
    )

    suspend fun resolve(artist: String, musicBrainzCountry: String?): String? = withContext(Dispatchers.IO) {
        musicBrainzCountry?.trim()?.uppercase()?.takeIf { it.length == 2 }?.let { return@withContext it }
        fetchMusicBrainzArtistCountry(artist) ?: fetchWikipediaNationality(artist)
    }

    private fun fetchMusicBrainzArtistCountry(artist: String): String? {
        return runCatching {
            val query = URLEncoder.encode("artist:\"$artist\"", "UTF-8")
            val url = "https://musicbrainz.org/ws/2/artist?query=$query&fmt=json&limit=3"
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "MusicStoryApp/1.0 (Android)")
                .get()
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@runCatching null
                val artists = JSONObject(response.body?.string().orEmpty()).optJSONArray("artists") ?: return@runCatching null
                for (i in 0 until artists.length()) {
                    val obj = artists.getJSONObject(i)
                    val country = obj.optString("country", "").trim().uppercase()
                    if (country.length == 2) return@runCatching country
                    val areaCountry = obj.optJSONObject("area")
                        ?.optJSONArray("iso-3166-1-codes")
                        ?.optString(0)
                        ?.trim()
                        ?.uppercase()
                    if (!areaCountry.isNullOrBlank() && areaCountry.length == 2) return@runCatching areaCountry
                }
                null
            }
        }.getOrNull()
    }

    private fun fetchWikipediaNationality(artist: String): String? {
        val titles = listOf(
            "$artist (band)",
            "$artist (musical group)",
            "$artist (musician)",
            "$artist (singer)",
            artist,
        )
        for (title in titles.distinct()) {
            val code = runCatching { fetchSummaryNationality(title) }.getOrNull()
            if (code != null) return code
        }
        return null
    }

    private fun fetchSummaryNationality(title: String): String? {
        val encoded = URLEncoder.encode(title.replace(' ', '_'), "UTF-8")
        val request = Request.Builder()
            .url("https://en.wikipedia.org/api/rest_v1/page/summary/$encoded")
            .header("User-Agent", "MusicStoryApp/1.0 (Android)")
            .get()
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return null
            val json = JSONObject(response.body?.string().orEmpty())
            val description = json.optString("description", "")
            val extract = json.optString("extract", "")
            return parseNationality("$description $extract")
        }
    }

    private fun parseNationality(text: String): String? {
        val lower = text.lowercase()
        return nationalityToCode.entries.firstOrNull { (word, _) ->
            Regex("""\b$word\b""").containsMatchIn(lower)
        }?.value
    }
}
