package com.musicstory.app.data.repository

import com.musicstory.app.data.local.ScrobbleDao
import com.musicstory.app.data.local.ScrobbleEntry
import com.musicstory.app.data.model.TrackInfo
import kotlinx.coroutines.flow.Flow

class ScrobbleRepository(
    private val scrobbleDao: ScrobbleDao,
) {
    val history: Flow<List<ScrobbleEntry>> = scrobbleDao.observeAll()

    fun recentHistory(limit: Int = 50): Flow<List<ScrobbleEntry>> =
        scrobbleDao.observeRecent(limit)

    suspend fun recordTrack(track: TrackInfo, storyTriggered: Boolean = false): Long {
        return scrobbleDao.insert(
            ScrobbleEntry(
                artist = track.artist,
                title = track.title,
                album = track.album,
                packageName = track.packageName,
                storyTriggered = storyTriggered,
            ),
        )
    }

    suspend fun totalCount(): Int = scrobbleDao.count()

    suspend fun storyTriggeredCount(): Int = scrobbleDao.countStoryTriggered()

    suspend fun wasRecentlyScrobbled(track: TrackInfo, withinMs: Long = 30_000): Boolean {
        val latest = scrobbleDao.findLatest(track.artist, track.title) ?: return false
        return System.currentTimeMillis() - latest.scrobbledAt < withinMs
    }

    suspend fun clearHistory() {
        scrobbleDao.deleteAll()
    }
}
