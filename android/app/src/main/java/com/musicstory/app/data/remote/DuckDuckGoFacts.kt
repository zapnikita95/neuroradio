package com.musicstory.app.data.remote

import com.musicstory.app.domain.ReferenceFactQuality
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/** DuckDuckGo Instant Answer — дополнительные факты без API-ключа. */
object DuckDuckGoFacts {

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    suspend fun fetch(artist: String, title: String): List<String> = withContext(Dispatchers.IO) {
        val queries = listOf(
            "$artist $title song",
            "$artist musician biography",
        )
        val collected = mutableListOf<String>()
        for (query in queries) {
            collected += fetchQuery(query)
            if (collected.size >= 6) break
        }
        ReferenceFactQuality.filterAndRank(collected.distinct(), 6)
    }

    private fun fetchQuery(query: String): List<String> {
        val encoded = URLEncoder.encode(query, Charsets.UTF_8.name())
        val url = "https://api.duckduckgo.com/?q=$encoded&format=json&no_html=1&skip_disambig=1"
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "MusicStoryApp/1.0 (Android)")
            .get()
            .build()
        return try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return emptyList()
                val json = JSONObject(response.body?.string().orEmpty())
                val results = mutableListOf<String>()
                json.optString("AbstractText").trim().takeIf { it.length >= 35 }?.let { results += it }
                json.optString("Abstract").trim().takeIf { it.length >= 35 }?.let { results += it }
                collectRelated(json.optJSONArray("RelatedTopics"), results)
                splitSentences(results.joinToString(" "))
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun collectRelated(array: JSONArray?, sink: MutableList<String>) {
        if (array == null) return
        for (i in 0 until array.length()) {
            if (sink.size >= 8) return
            when (val item = array.opt(i)) {
                is JSONObject -> {
                    item.optString("Text").trim().takeIf { it.length >= 35 }?.let { sink += it }
                    collectRelated(item.optJSONArray("Topics"), sink)
                }
            }
        }
    }

    private fun splitSentences(text: String): List<String> =
        text.split(Regex("(?<=[.!?…])\\s+"))
            .map { it.trim() }
            .filter { it.length in 35..240 }
}
