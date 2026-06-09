package com.musicstory.app.domain

import android.content.Context
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.media.MediaControllerManager
import com.musicstory.app.media.MediaSessionSelector
import com.musicstory.app.service.MediaMonitorService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MonitorLifecycle(
    private val context: Context,
    private val settingsDataStore: SettingsDataStore,
    private val mediaControllerManager: MediaControllerManager,
    private val storyOrchestrator: StoryOrchestrator,
    private val scope: CoroutineScope,
) {

    val appPowerMode: Flow<AppPowerMode> = settingsDataStore.appPowerMode
    val monitorPausedByUser: Flow<Boolean> = settingsDataStore.monitorPausedByUser

    private var idleStopJob: Job? = null

    init {
        scope.launch {
            combine(
                mediaControllerManager.isPlaying,
                mediaControllerManager.activePackage,
                storyOrchestrator.state,
                settingsDataStore.appPowerMode,
            ) { playing, pkg, orchState, powerMode ->
                Triple(playing, pkg, orchState) to powerMode
            }
                .distinctUntilChanged()
                .collect { syncMonitorWithMedia() }
        }
    }

    fun hasActiveMusicMedia(): Boolean {
        val pkg = mediaControllerManager.activePackage.value
        if (MediaSessionSelector.isBlockedPackage(pkg)) return false
        if (!MediaSessionSelector.isPreferredPackage(pkg)) return false
        val track = mediaControllerManager.effectiveNowPlaying.value
        if (track?.isValid() != true) return false
        if (mediaControllerManager.isPlaying.value) return true
        return track.isValid()
    }

    private fun shouldShowNotification(): Boolean {
        if (storyOrchestrator.isStorySessionActive()) return true
        return hasActiveMusicMedia()
    }

    suspend fun syncMonitorWithMedia() {
        when (settingsDataStore.appPowerMode.first()) {
            AppPowerMode.OFF -> return
            AppPowerMode.PARSE_ONLY, AppPowerMode.ON -> Unit
        }

        if (shouldShowNotification()) {
            idleStopJob?.cancel()
            idleStopJob = null
            startMonitorServiceIfNeeded()
        } else {
            scheduleStopWhenIdle()
        }
    }

    fun ensureListening() {
        if (!mediaControllerManager.hasNotificationAccess()) return
        scope.launch {
            when (settingsDataStore.appPowerMode.first()) {
                AppPowerMode.OFF -> return@launch
                AppPowerMode.PARSE_ONLY, AppPowerMode.ON -> {
                    withContext(Dispatchers.Main.immediate) {
                        mediaControllerManager.start()
                    }
                    syncMonitorWithMedia()
                }
            }
        }
    }

    suspend fun setAppPowerMode(mode: AppPowerMode) {
        idleStopJob?.cancel()
        idleStopJob = null
        settingsDataStore.setAppPowerMode(mode)
        when (mode) {
            AppPowerMode.OFF -> {
                storyOrchestrator.stopStory()
                storyOrchestrator.setServiceRunning(false)
                MediaMonitorService.stop(context)
                withContext(Dispatchers.Main.immediate) {
                    mediaControllerManager.stop()
                }
            }
            AppPowerMode.PARSE_ONLY, AppPowerMode.ON -> {
                withContext(Dispatchers.Main.immediate) {
                    mediaControllerManager.start()
                }
                syncMonitorWithMedia()
            }
        }
    }

    suspend fun cycleAppPowerMode() {
        val next = settingsDataStore.appPowerMode.first().next()
        setAppPowerMode(next)
    }

    suspend fun pauseByUser() = setAppPowerMode(AppPowerMode.OFF)

    suspend fun resume() = setAppPowerMode(AppPowerMode.ON)

    fun tryWakeFromMusicApp(packageName: String) {
        if (MediaSessionSelector.isBlockedPackage(packageName)) return
        if (!MediaSessionSelector.isPreferredPackage(packageName)) return
        scope.launch {
            if (settingsDataStore.appPowerMode.first() == AppPowerMode.OFF) return@launch
            withContext(Dispatchers.Main.immediate) {
                mediaControllerManager.refreshActiveController()
            }
            syncMonitorWithMedia()
        }
    }

    fun tryWakeFromActiveMedia() {
        scope.launch {
            if (settingsDataStore.appPowerMode.first() == AppPowerMode.OFF) return@launch
            withContext(Dispatchers.Main.immediate) {
                mediaControllerManager.refreshActiveController()
            }
            syncMonitorWithMedia()
        }
    }

    private fun startMonitorServiceIfNeeded() {
        MediaMonitorService.start(context)
        storyOrchestrator.setServiceRunning(true)
    }

    private fun scheduleStopWhenIdle() {
        if (idleStopJob?.isActive == true) return
        idleStopJob = scope.launch {
            delay(IDLE_STOP_DELAY_MS)
            if (shouldShowNotification()) return@launch
            if (settingsDataStore.appPowerMode.first() == AppPowerMode.OFF) return@launch
            storyOrchestrator.setServiceRunning(false)
            MediaMonitorService.stop(context)
        }
    }

    companion object {
        private const val IDLE_STOP_DELAY_MS = 4_000L
    }
}
