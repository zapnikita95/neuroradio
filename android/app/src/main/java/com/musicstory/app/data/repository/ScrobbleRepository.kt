package com.musicstory.app.data.repository

import com.musicstory.app.data.local.ScrobbleDao
import com.musicstory.app.data.local.ScrobbleEntry
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.data.remote.AccountSyncManager
import com.musicstory.app.data.remote.MusicBrainzGenreLookup
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class ScrobbleRepository(
    private val scrobbleDao: ScrobbleDao,
    private val accountSyncManager: AccountSyncManager? = null,
    private val settingsDataStore: SettingsDataStore? = null,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val genreCache = ConcurrentHashMap<String, String>()

    val history: Flow<List<ScrobbleEntry>> = scrobbleDao.observeAll()

    fun recentHistory(limit: Int = 50): Flow<List<ScrobbleEntry>> =
        scrobbleDao.observeRecent(limit)

    fun topArtists(limit: Int = 100): Flow<List<com.musicstory.app.data.local.ScrobbleArtistStat>> =
        scrobbleDao.observeTopArtists(limit)

    fun topGenres(limit: Int = 50): Flow<List<com.musicstory.app.data.local.ScrobbleGenreStat>> =
        scrobbleDao.observeTopGenres(limit)

    /** Record any track play and enrich genre in background. */
    suspend fun scrobbleTrack(track: TrackInfo): Long {
        val cachedGenre = genreCache[trackKey(track.artist, track.title)]
            ?: scrobbleDao.findLatestGenreForArtist(track.artist)
        val serverId = UUID.randomUUID().toString()
        val entryId = scrobbleDao.insert(
            ScrobbleEntry(
                serverId = serverId,
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
        scopePushScrobble(
            ScrobbleEntry(
                id = entryId,
                serverId = serverId,
                artist = track.artist,
                title = track.title,
                album = track.album,
                genre = cachedGenre,
                packageName = track.packageName,
                storyTriggered = false,
            ),
        )
        return entryId
    }

    suspend fun markStoryTriggered(track: TrackInfo) {
        val latest = scrobbleDao.findLatest(track.artist, track.title) ?: return
        scrobbleDao.markStoryTriggered(latest.id)
        scopePushScrobble(latest.copy(storyTriggered = true))
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

    suspend fun mergeFromServer(baseUrl: String) {
        val sync = accountSyncManager ?: return
        val remote = sync.pullScrobbles(baseUrl.trim()) ?: return
        for (entry in remote) {
            val serverId = entry.serverId?.takeIf { it.isNotBlank() }
            if (serverId != null && scrobbleDao.countByServerId(serverId) > 0) continue
            if (scrobbleDao.countByTrackAndTime(entry.artist, entry.title, entry.scrobbledAt) > 0) continue
            scrobbleDao.insert(entry)
        }
    }

    suspend fun syncAccountDataWithServer(baseUrl: String) {
        mergeFromServer(baseUrl)
        pushAllLocalToServer(baseUrl)
    }

    private suspend fun pushAllLocalToServer(baseUrl: String) {
        val sync = accountSyncManager ?: return
        val store = settingsDataStore ?: return
        val url = baseUrl.trim()
        if (url.isBlank()) return
        val syncCode = store.syncCode.first()
        for (entry in scrobbleDao.getRecent()) {
            sync.pushScrobbleEntry(
                baseUrl = url,
                entry = entry,
                localSyncCode = syncCode,
                onSyncCodeUpdated = { store.setSyncCode(it) },
            )
        }
    }

    private fun enrichGenreAsync(entryId: Long, track: TrackInfo) {
        scope.launch {
            runCatching {
                val genre = MusicBrainzGenreLookup.fetchGenre(track.artist, track.title)?.trim()?.takeIf { it.isNotEmpty() }
                    ?: return@launch
                scrobbleDao.updateGenre(entryId, genre)
                genreCache[trackKey(track.artist, track.title)] = genre
            }
        }
    }

    private fun scopePushScrobble(entry: ScrobbleEntry) {
        val sync = accountSyncManager ?: return
        val store = settingsDataStore ?: return
        scope.launch {
            val url = store.backendUrl.first()
            if (url.isBlank()) return@launch
            sync.pushScrobbleEntry(
                baseUrl = url,
                entry = entry,
                localSyncCode = store.syncCode.first(),
                onSyncCodeUpdated = { store.setSyncCode(it) },
            )
        }
    }

    private fun trackKey(artist: String, title: String): String =
        "${artist.lowercase()}|${title.lowercase()}"
}
