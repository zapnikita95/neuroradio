package com.musicstory.app.data.repository

import android.os.Build
import com.musicstory.app.data.local.CachedStory
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.local.StoryDao
import com.musicstory.app.data.local.StoryHistoryDao
import com.musicstory.app.data.local.StoryHistoryEntry
import com.musicstory.app.data.model.StoryRequest
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.data.remote.ApiClient
import com.musicstory.app.data.remote.GroqStoryClient
import com.musicstory.app.data.remote.MetadataEnricher
import com.musicstory.app.domain.LocalStoryGenerator
import com.musicstory.app.domain.StoryPersona
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout

class StoryRepository(
    private val storyDao: StoryDao,
    private val storyHistoryDao: StoryHistoryDao,
    private val settingsDataStore: SettingsDataStore,
    private val groqStoryClient: GroqStoryClient = GroqStoryClient(),
    private val metadataEnricher: MetadataEnricher = MetadataEnricher(),
) {
    suspend fun fetchStory(track: TrackInfo, forceRefresh: Boolean = true): Result<StoryResponse> {
        if (!track.isValid()) {
            return Result.failure(IllegalArgumentException("Некорректные метаданные трека"))
        }

        val trackKey = track.displayKey
        val previousScripts = storyHistoryDao.getRecentScripts(trackKey)

        if (!forceRefresh && previousScripts.isEmpty()) {
            val cached = storyDao.getByTrackKey(trackKey)
            if (cached != null && !isCacheExpired(cached) && !isStaleRadioScript(cached.script)) {
                return Result.success(cached.toResponse())
            }
        }

        val metadata = try {
            withTimeout(METADATA_TIMEOUT_MS) {
                metadataEnricher.enrich(track.artist, track.title)
            }
        } catch (_: Exception) {
            com.musicstory.app.data.remote.TrackMetadata()
        }

        val year = metadata.year
        val genre = metadata.genre
        val angle = StoryPersona.pickAngle(previousScripts.size)

        val backendUrl = settingsDataStore.backendUrl.first().trim()
        val backendSecret = settingsDataStore.backendSecret.first().trim()
        val groqKey = settingsDataStore.groqApiKey.first().trim()
        val useBackend = shouldTryBackend(backendUrl)

        if (useBackend) {
            try {
                val response = withTimeout(BACKEND_TIMEOUT_MS) {
                    val api = ApiClient.getApi(backendUrl, backendSecret)
                    api.fetchFullStory(
                        StoryRequest(
                            artist = track.artist,
                            title = track.title,
                            previousScripts = previousScripts,
                        ),
                    )
                }
                if (!response.demo && !isDuplicateScript(response.script, previousScripts)) {
                    persistStory(trackKey, track, response, angle.labelRu)
                    return Result.success(response)
                }
            } catch (_: Exception) {
                // fall through
            }

            try {
                val groqStory = withTimeout(GROQ_TIMEOUT_MS) {
                    groqStoryClient.generateStory(
                        artist = track.artist,
                        title = track.title,
                        year = year,
                        genre = genre,
                        previousScripts = previousScripts,
                        angle = angle,
                        backendProxyUrl = backendUrl,
                        backendProxySecret = backendSecret,
                    )
                }
                if (groqStory != null && !isDuplicateScript(groqStory.script, previousScripts)) {
                    persistStory(trackKey, track, groqStory, angle.labelRu)
                    return Result.success(groqStory)
                }
            } catch (_: Exception) {
                // fall through
            }
        }

        if (groqKey.isNotEmpty()) {
            try {
                val groqStory = withTimeout(GROQ_TIMEOUT_MS) {
                    groqStoryClient.generateStory(
                        apiKey = groqKey,
                        artist = track.artist,
                        title = track.title,
                        year = year,
                        genre = genre,
                        previousScripts = previousScripts,
                        angle = angle,
                    )
                }
                if (groqStory != null && !isDuplicateScript(groqStory.script, previousScripts)) {
                    persistStory(trackKey, track, groqStory, angle.labelRu)
                    return Result.success(groqStory)
                }
            } catch (_: Exception) {
                // fall through
            }
        }

        val local = LocalStoryGenerator.generate(
            artist = track.artist,
            title = track.title,
            year = year,
            genre = genre,
            previousScripts = previousScripts,
            angleIndex = previousScripts.size,
        )
        persistStory(trackKey, track, local, angle.labelRu)
        return Result.success(local)
    }

    suspend fun recordStoryPlayed(track: TrackInfo, response: StoryResponse, angle: String?) {
        storyHistoryDao.insert(
            StoryHistoryEntry(
                trackKey = track.displayKey,
                artist = track.artist,
                title = track.title,
                script = response.script,
                angle = angle,
            ),
        )
    }

    suspend fun resolveAudioUrl(audioUrl: String?): String? {
        if (audioUrl.isNullOrBlank()) return null
        val baseUrl = settingsDataStore.backendUrl.first()
        return ApiClient.resolveAudioUrl(baseUrl, audioUrl)
    }

    private suspend fun persistStory(
        trackKey: String,
        track: TrackInfo,
        response: StoryResponse,
        angle: String,
    ) {
        storyDao.insert(
            CachedStory(
                trackKey = trackKey,
                artist = response.artist,
                title = response.title,
                year = response.year,
                genre = response.genre,
                script = response.script,
                audioUrl = response.audioUrl,
                demo = response.demo,
            ),
        )
        storyHistoryDao.insert(
            StoryHistoryEntry(
                trackKey = trackKey,
                artist = track.artist,
                title = track.title,
                script = response.script,
                angle = angle,
            ),
        )
    }

    private fun isDuplicateScript(script: String, previous: List<String>): Boolean {
        val normalized = script.lowercase().trim()
        return previous.any { prev ->
            val p = prev.lowercase().trim()
            p == normalized || similarity(p, normalized) > 0.85
        }
    }

    private fun similarity(a: String, b: String): Double {
        val wordsA = a.split(Regex("\\s+")).toSet()
        val wordsB = b.split(Regex("\\s+")).toSet()
        if (wordsA.isEmpty() || wordsB.isEmpty()) return 0.0
        val intersection = wordsA.intersect(wordsB).size
        return intersection.toDouble() / maxOf(wordsA.size, wordsB.size)
    }

    private fun shouldTryBackend(url: String): Boolean {
        if (url.isBlank()) return false
        if (url.contains("10.0.2.2") && !isEmulator()) return false
        return true
    }

    private fun isEmulator(): Boolean {
        return Build.FINGERPRINT.contains("generic", ignoreCase = true) ||
            Build.FINGERPRINT.contains("emulator", ignoreCase = true) ||
            Build.MODEL.contains("Emulator", ignoreCase = true) ||
            Build.MODEL.contains("Android SDK built for", ignoreCase = true)
    }

    private fun isCacheExpired(cached: CachedStory): Boolean {
        val maxAgeMs = if (cached.demo) 60 * 60 * 1000L else 24 * 60 * 60 * 1000L
        return System.currentTimeMillis() - cached.fetchedAt > maxAgeMs
    }

    private fun isStaleRadioScript(script: String): Boolean {
        val lower = script.lowercase()
        return lower.contains("music story") ||
            lower.contains("сейчас в эфире") ||
            lower.contains("на волнах") ||
            lower.contains("добро пожаловать")
    }

    private fun CachedStory.toResponse(): StoryResponse = StoryResponse(
        artist = artist,
        title = title,
        year = year,
        genre = genre,
        script = script,
        demo = demo,
        audioUrl = audioUrl,
    )

    companion object {
        private const val GROQ_TIMEOUT_MS = 50_000L
        private const val BACKEND_TIMEOUT_MS = 55_000L
        private const val METADATA_TIMEOUT_MS = 4_000L
    }
}
