package com.musicstory.app.data.remote

import com.musicstory.app.domain.ReferenceFactQuality
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** MusicBrainz annotations — заметки кураторов базы. */
object MusicBrainzFacts {

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    suspend fun fetchRecordingAnnotations(recordingMbid: String?): List<String> =
        fetchAnnotations("recording", recordingMbid)

    suspend fun fetchArtistAnnotations(artistMbid: String?): List<String> =
        fetchAnnotations("artist", artistMbid)

    private suspend fun fetchAnnotations(entity: String, mbid: String?): List<String> =
        withContext(Dispatchers.IO) {
            val id = mbid?.trim().orEmpty()
            if (id.isEmpty()) return@withContext emptyList()
            val url = "https://musicbrainz.org/ws/2/$entity/$id?inc=annotations&fmt=json"
            val request = Request.Builder()
                .url(url)
                .header("User-Agent", "MusicStoryApp/1.0 (Android)")
                .get()
                .build()
            try {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@withContext emptyList()
                    val json = JSONObject(response.body?.string().orEmpty())
                    val annotations = json.optJSONArray("annotations") ?: return@withContext emptyList()
                    val texts = mutableListOf<String>()
                    for (i in 0 until annotations.length()) {
                        val text = annotations.getJSONObject(i).optString("annotation").trim()
                        if (text.length >= 35) {
                            texts += text.split(Regex("(?<=[.!?…])\\s+"))
                                .map { it.trim() }
                                .filter { it.length in 35..240 }
                        }
                    }
                    ReferenceFactQuality.filterAndRank(texts.distinct(), 4)
                }
            } catch (_: Exception) {
                emptyList()
            }
        }
}
