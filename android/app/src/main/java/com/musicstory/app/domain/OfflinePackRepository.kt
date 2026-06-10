package com.musicstory.app.domain

import android.content.Context
import com.musicstory.app.data.local.OfflinePackDao
import com.musicstory.app.data.local.OfflinePackEntry
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.data.repository.StoryRepository
import com.musicstory.app.util.StoryLog
import com.musicstory.app.worker.OfflinePackWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class OfflinePackUiState(
    val phase: OfflinePackPhase = OfflinePackPhase.IDLE,
    val sessionId: Long = 0L,
    val targetCount: Int = 10,
    val collectedCount: Int = 0,
    val readyCount: Int = 0,
    val entries: List<OfflinePackEntry> = emptyList(),
)

/** Collect 10 tracks from player, then generate stories + OGG in background. */
class OfflinePackRepository(
    private val context: Context,
    private val offlinePackDao: OfflinePackDao,
    private val settingsDataStore: SettingsDataStore,
    private val storyRepository: StoryRepository,
    private val notifier: OfflinePackNotifier,
) {
    private val mutex = Mutex()
    private val _state = MutableStateFlow(OfflinePackUiState())
    val state: StateFlow<OfflinePackUiState> = _state.asStateFlow()

    suspend fun refreshState() {
        val phase = OfflinePackPhase.fromId(settingsDataStore.offlinePackPhase.first())
        val sessionId = settingsDataStore.offlinePackSessionId.first()
        val entries = if (sessionId > 0L) offlinePackDao.listBySession(sessionId) else emptyList()
        _state.value = OfflinePackUiState(
            phase = phase,
            sessionId = sessionId,
            collectedCount = entries.size,
            readyCount = entries.count { it.status == STATUS_READY },
            entries = entries,
        )
    }

    suspend fun startCollecting(): Result<Unit> {
        if (!canUseOfflinePack()) {
            return Result.failure(IllegalStateException("Офлайн-эфир доступен на расширенном тарифе"))
        }
        return mutex.withLock {
            val oldSessionId = settingsDataStore.offlinePackSessionId.first()
            if (oldSessionId > 0L) offlinePackDao.deleteSession(oldSessionId)
            val sessionId = System.currentTimeMillis()
            settingsDataStore.setOfflineAudioCacheEnabled(true)
            settingsDataStore.setOfflinePackSessionId(sessionId)
            settingsDataStore.setOfflinePackPhase(OfflinePackPhase.COLLECTING.id)
            refreshState()
            notifier.showCollectingProgress(0, TARGET_COUNT)
            StoryLog.i("Offline pack collecting started session=$sessionId")
            Result.success(Unit)
        }
    }

    suspend fun cancelPack() {
        mutex.withLock {
            val sessionId = settingsDataStore.offlinePackSessionId.first()
            if (sessionId > 0L) offlinePackDao.deleteSession(sessionId)
            settingsDataStore.setOfflinePackPhase(OfflinePackPhase.IDLE.id)
            settingsDataStore.setOfflinePackSessionId(0L)
            notifier.cancelAll()
            refreshState()
        }
    }

    /** Called on each new track while user skips/shuffles in the player. */
    suspend fun onTrackHeard(track: TrackInfo) {
        if (!track.isValid()) return
        if (settingsDataStore.offlinePackPhase.first() != OfflinePackPhase.COLLECTING.id) return
        if (!canUseOfflinePack()) return

        mutex.withLock {
            val sessionId = settingsDataStore.offlinePackSessionId.first()
            if (sessionId <= 0L) return@withLock
            if (offlinePackDao.findByTrack(sessionId, track.displayKey) != null) return@withLock

            val count = offlinePackDao.countBySession(sessionId)
            if (count >= TARGET_COUNT) return@withLock

            offlinePackDao.insert(
                OfflinePackEntry(
                    packSessionId = sessionId,
                    trackKey = track.displayKey,
                    artist = track.artist,
                    title = track.title,
                    sortOrder = count,
                    status = STATUS_COLLECTED,
                ),
            )
            val newCount = count + 1
            refreshState()
            notifier.showCollectingProgress(newCount, TARGET_COUNT)
            StoryLog.i("Offline pack collected $newCount/$TARGET_COUNT: ${track.artist} — ${track.title}")

            if (newCount >= TARGET_COUNT) {
                onCollectionComplete(sessionId)
            }
        }
    }

    private suspend fun onCollectionComplete(sessionId: Long) {
        settingsDataStore.setOfflinePackPhase(OfflinePackPhase.GENERATING.id)
        refreshState()
        notifier.showTracksCollected(TARGET_COUNT)
        OfflinePackWorker.enqueue(context, sessionId)
    }

    /** Runs in WorkManager — generate story + OGG for each collected track. */
    suspend fun generatePack(sessionId: Long): Boolean {
        if (!canUseOfflinePack()) return false
        settingsDataStore.setOfflinePackPhase(OfflinePackPhase.GENERATING.id)
        settingsDataStore.setOfflinePackSessionId(sessionId)

        val entries = offlinePackDao.listBySession(sessionId)
            .filter { it.status == STATUS_COLLECTED || it.status == STATUS_FAILED }
        var ready = offlinePackDao.countReadyBySession(sessionId)

        for (entry in entries) {
            if (entry.status == STATUS_READY) continue
            offlinePackDao.markGenerating(entry.id)
            refreshState()
            notifier.showGeneratingProgress(ready, TARGET_COUNT)

            val track = TrackInfo(artist = entry.artist, title = entry.title)
            val result = storyRepository.fetchStoryForOfflinePack(track)
            result.fold(
                onSuccess = { response ->
                    val cached = storyRepository.getCachedLocalPath(track.displayKey)
                    offlinePackDao.updateResult(
                        id = entry.id,
                        status = STATUS_READY,
                        localPath = cached,
                        script = response.script,
                        readyAt = System.currentTimeMillis(),
                        error = null,
                    )
                    ready++
                },
                onFailure = { e ->
                    offlinePackDao.updateResult(
                        id = entry.id,
                        status = STATUS_FAILED,
                        localPath = null,
                        script = null,
                        readyAt = null,
                        error = e.message?.take(200),
                    )
                    StoryLog.w("Offline pack gen failed ${entry.title}: ${e.message}")
                },
            )
            refreshState()
            notifier.showGeneratingProgress(ready, TARGET_COUNT)
        }

        val finalReady = offlinePackDao.countReadyBySession(sessionId)
        if (finalReady > 0) {
            settingsDataStore.setOfflinePackPhase(OfflinePackPhase.READY.id)
            refreshState()
            notifier.showPackReady(finalReady)
            return true
        }
        settingsDataStore.setOfflinePackPhase(OfflinePackPhase.IDLE.id)
        refreshState()
        notifier.showPackFailed()
        return false
    }

    suspend fun findReadyPackEntry(trackKey: String): OfflinePackEntry? {
        val sessionId = settingsDataStore.offlinePackSessionId.first()
        if (sessionId <= 0L) return null
        if (settingsDataStore.offlinePackPhase.first() != OfflinePackPhase.READY.id) return null
        return offlinePackDao.findReadyTrack(sessionId, trackKey)
    }

    private suspend fun canUseOfflinePack(): Boolean {
        val tier = storyRepository.dailyQuota.value?.tier
        return TierAccess.canUseOfflineAudioCache(tier)
    }

    companion object {
        const val TARGET_COUNT = 10
        const val STATUS_COLLECTED = "collected"
        const val STATUS_GENERATING = "generating"
        const val STATUS_READY = "ready"
        const val STATUS_FAILED = "failed"
    }
}
