package com.musicstory.app.data.remote

import com.musicstory.app.domain.ReferenceFactQuality
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/** Wikidata — структурированные описания и подписи без API-ключа. */
object WikidataFacts {

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    suspend fun fetch(artist: String, title: String, countryCode: String?): List<String> =
        withContext(Dispatchers.IO) {
            val lang = if (countryCode == "RU") "ru" else "en"
            val track = searchEntity("$title $artist song", lang)
            val artistFacts = searchEntity(artist, lang)
            val merged = (track + artistFacts).distinct()
            ReferenceFactQuality.filterAndRank(merged, 5)
        }

    private fun searchEntity(query: String, lang: String): List<String> {
        val encoded = URLEncoder.encode(query, Charsets.UTF_8.name())
        val url =
            "https://www.wikidata.org/w/api.php?action=wbsearchentities&search=$encoded" +
                "&language=$lang&format=json&origin=*&limit=3"
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "MusicStoryApp/1.0 (Android)")
            .get()
            .build()
        return try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val json = JSONObject(response.body?.string().orEmpty())
                val array = json.optJSONArray("search") ?: return emptyList()
                val results = mutableListOf<String>()
                for (i in 0 until minOf(array.length(), 2)) {
                    val item = array.getJSONObject(i)
                    val label = item.optString("label").trim()
                    val description = item.optString("description").trim()
                    if (label.isNotBlank() && description.length >= 25) {
                        results += "$label — $description."
                    } else if (description.length >= 35) {
                        results += description
                    }
                }
                results
            }
        } catch (_: Exception) {
            emptyList()
        }
    }
}
