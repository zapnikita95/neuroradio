package com.musicstory.app.domain



import android.content.Context

import com.musicstory.app.data.local.SettingsDataStore

import com.musicstory.app.media.MediaControllerManager

import com.musicstory.app.media.MediaSessionSelector

import com.musicstory.app.service.MediaMonitorService

import kotlinx.coroutines.CoroutineScope

import kotlinx.coroutines.Job

import kotlinx.coroutines.delay

import kotlinx.coroutines.flow.Flow

import kotlinx.coroutines.flow.combine

import kotlinx.coroutines.flow.distinctUntilChanged

import kotlinx.coroutines.flow.first

import kotlinx.coroutines.launch



class MonitorLifecycle(

    private val context: Context,

    private val settingsDataStore: SettingsDataStore,

    private val mediaControllerManager: MediaControllerManager,

    private val storyOrchestrator: StoryOrchestrator,

    private val scope: CoroutineScope,

) {

    val monitorPausedByUser: Flow<Boolean> = settingsDataStore.monitorPausedByUser



    private var idleStopJob: Job? = null



    init {

        scope.launch {

            combine(

                mediaControllerManager.isPlaying,

                mediaControllerManager.activePackage,

                storyOrchestrator.state,

            ) { playing, pkg, orchState ->

                Triple(playing, pkg, orchState)

            }

                .distinctUntilChanged()

                .collect { syncMonitorWithMedia() }

        }

    }



    fun hasActiveMusicMedia(): Boolean {

        val pkg = mediaControllerManager.activePackage.value

        if (!MediaSessionSelector.isPreferredPackage(pkg)) return false

        return mediaControllerManager.isPlaying.value

    }



    private fun shouldShowNotification(): Boolean {

        if (storyOrchestrator.isStorySessionActive()) return true

        return hasActiveMusicMedia()

    }



    suspend fun syncMonitorWithMedia() {

        if (settingsDataStore.monitorPausedByUser.first()) return



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

        mediaControllerManager.start()

        scope.launch { syncMonitorWithMedia() }

    }



    suspend fun pauseByUser() {

        idleStopJob?.cancel()

        idleStopJob = null

        settingsDataStore.setMonitorPausedByUser(true)

        storyOrchestrator.stopStory()

        storyOrchestrator.setServiceRunning(false)

        MediaMonitorService.stop(context)

    }



    suspend fun resume() {

        settingsDataStore.setMonitorPausedByUser(false)

        mediaControllerManager.start()

        syncMonitorWithMedia()

    }



    fun tryWakeFromMusicApp(packageName: String) {

        if (!MediaSessionSelector.isPreferredPackage(packageName)) return

        scope.launch {

            mediaControllerManager.refreshActiveController()

            if (settingsDataStore.monitorPausedByUser.first()) {

                settingsDataStore.setMonitorPausedByUser(false)

            }

            syncMonitorWithMedia()

        }

    }



    fun tryWakeFromActiveMedia() {

        scope.launch {

            mediaControllerManager.refreshActiveController()

            if (settingsDataStore.monitorPausedByUser.first()) {

                if (!hasActiveMusicMedia()) return@launch

                settingsDataStore.setMonitorPausedByUser(false)

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

            if (settingsDataStore.monitorPausedByUser.first()) return@launch

            storyOrchestrator.setServiceRunning(false)

            MediaMonitorService.stop(context)

        }

    }



    companion object {

        private const val IDLE_STOP_DELAY_MS = 4_000L

    }

}


