package com.musicstory.app.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/** Кэш метаданных + один in-flight запрос на трек. */
class MetadataCache(
    private val enricher: MetadataEnricher,
) {
    private data class Entry(val metadata: TrackMetadata, val atMs: Long)

    private val cache = ConcurrentHashMap<String, Entry>()
    private val locks = ConcurrentHashMap<String, Mutex>()

    suspend fun getOrFetch(artist: String, title: String): TrackMetadata {
        val key = cacheKey(artist, title)
        cache[key]?.takeIf { !isExpired(it) }?.metadata?.let { return it }
        val mutex = locks.getOrPut(key) { Mutex() }
        return mutex.withLock {
            cache[key]?.takeIf { !isExpired(it) }?.metadata?.let { return it }
            val metadata = enricher.enrichInternal(artist, title)
            cache[key] = Entry(metadata, System.currentTimeMillis())
            metadata
        }
    }

    fun peek(artist: String, title: String): TrackMetadata? =
        cache[cacheKey(artist, title)]?.takeIf { !isExpired(it) }?.metadata

    private fun isExpired(entry: Entry): Boolean =
        System.currentTimeMillis() - entry.atMs > TTL_MS

    private fun cacheKey(artist: String, title: String): String =
        "${artist.lowercase()}|${title.lowercase()}"

    companion object {
        private const val TTL_MS = 72L * 60 * 60 * 1000
    }
}

/** Только жанр — один запрос MusicBrainz, без Wikipedia. */
object MusicBrainzGenreLookup {

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    private val genreCache = ConcurrentHashMap<String, String>()

    suspend fun fetchGenre(artist: String, title: String): String? = withContext(Dispatchers.IO) {
        val key = "${artist.lowercase()}|${title.lowercase()}"
        genreCache[key]?.let { return@withContext it }
        val query = URLEncoder.encode("artist:\"$artist\" AND recording:\"$title\"", Charsets.UTF_8.name())
        val url = "https://musicbrainz.org/ws/2/recording?query=$query&fmt=json&limit=1&inc=tags"
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "MusicStoryApp/1.0 (Android)")
            .get()
            .build()
        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val json = JSONObject(response.body?.string().orEmpty())
                val recordings = json.optJSONArray("recordings") ?: return@withContext null
                if (recordings.length() == 0) return@withContext null
                val tags = recordings.getJSONObject(0).optJSONArray("tags") ?: return@withContext null
                var bestName: String? = null
                var bestCount = -1
                for (i in 0 until tags.length()) {
                    val tag = tags.getJSONObject(i)
                    val count = tag.optInt("count", 0)
                    if (count > bestCount) {
                        bestCount = count
                        bestName = tag.optString("name").takeIf { it.isNotBlank() }
                    }
                }
                bestName?.also { genreCache[key] = it }
            }
        } catch (_: Exception) {
            null
        }
    }
}
