package com.musicstory.app.data.repository

import com.musicstory.app.data.local.ScrobbleArtistStat
import com.musicstory.app.data.local.ScrobbleDao
import com.musicstory.app.data.local.ScrobbleEntry
import com.musicstory.app.data.local.ScrobbleGenreStat
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.data.remote.MetadataEnricher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

class ScrobbleRepository(
    private val scrobbleDao: ScrobbleDao,
    private val metadataEnricher: MetadataEnricher = MetadataEnricher(),
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val genreCache = ConcurrentHashMap<String, String>()

    val history: Flow<List<ScrobbleEntry>> = scrobbleDao.observeAll()

    fun recentHistory(limit: Int = 50): Flow<List<ScrobbleEntry>> =
        scrobbleDao.observeRecent(limit)

    fun topArtists(limit: Int = 100): Flow<List<ScrobbleArtistStat>> =
        scrobbleDao.observeTopArtists(limit)

    fun topGenres(limit: Int = 50): Flow<List<ScrobbleGenreStat>> =
        scrobbleDao.observeTopGenres(limit)

    /** Record any track play and enrich genre in background. */
    suspend fun scrobbleTrack(track: TrackInfo): Long {
        val cachedGenre = genreCache[trackKey(track.artist, track.title)]
            ?: scrobbleDao.findLatestGenreForArtist(track.artist)
        val entryId = scrobbleDao.insert(
            ScrobbleEntry(
                artist = track.artist,
                title = track.title,
                album = track.album,
                genre = cachedGenre,
                packageName = track.packageName,
                storyTriggered = false,
            ),
        )
        if (cachedGenre == null) {
            enrichGenreAsync(entryId, track)
        }
        return entryId
    }

    suspend fun markStoryTriggered(track: TrackInfo) {
        val latest = scrobbleDao.findLatest(track.artist, track.title) ?: return
        scrobbleDao.markStoryTriggered(latest.id)
    }

    suspend fun lookupGenre(artist: String, title: String): String? {
        genreCache[trackKey(artist, title)]?.let { return it }
        scrobbleDao.findLatest(artist, title)?.genre?.takeIf { it.isNotBlank() }?.let {
            genreCache[trackKey(artist, title)] = it
            return it
        }
        return scrobbleDao.findLatestGenreForArtist(artist)?.also {
            genreCache[trackKey(artist, title)] = it
        }
    }

    suspend fun totalCount(): Int = scrobbleDao.count()

    suspend fun storyTriggeredCount(): Int = scrobbleDao.countStoryTriggered()

    suspend fun wasRecentlyScrobbled(track: TrackInfo, withinMs: Long = 30_000): Boolean {
        val latest = scrobbleDao.findLatest(track.artist, track.title) ?: return false
        return System.currentTimeMillis() - latest.scrobbledAt < withinMs
    }

    suspend fun clearHistory() {
        scrobbleDao.deleteAll()
        genreCache.clear()
    }

    private fun enrichGenreAsync(entryId: Long, track: TrackInfo) {
        scope.launch {
            runCatching {
                val metadata = metadataEnricher.enrich(track.artist, track.title)
                val genre = metadata.genre?.trim()?.takeIf { it.isNotEmpty() } ?: return@launch
                scrobbleDao.updateGenre(entryId, genre)
                genreCache[trackKey(track.artist, track.title)] = genre
            }
        }
    }

    private fun trackKey(artist: String, title: String): String =
        "${artist.lowercase()}|${title.lowercase()}"
}
