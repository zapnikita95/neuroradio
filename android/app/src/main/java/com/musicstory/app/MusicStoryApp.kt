package com.musicstory.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.musicstory.app.data.local.AppDatabase
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.repository.ScrobbleRepository
import com.musicstory.app.data.repository.StoryRepository
import com.musicstory.app.domain.StoryOrchestrator
import com.musicstory.app.domain.StoryPlayer
import com.musicstory.app.domain.TriggerEngine
import com.musicstory.app.media.MediaControllerManager

class MusicStoryApp : Application() {

    lateinit var settingsDataStore: SettingsDataStore
        private set

    lateinit var scrobbleRepository: ScrobbleRepository
        private set

    lateinit var storyRepository: StoryRepository
        private set

    lateinit var mediaControllerManager: MediaControllerManager
        private set

    lateinit var storyPlayer: StoryPlayer
        private set

    lateinit var triggerEngine: TriggerEngine
        private set

    lateinit var storyOrchestrator: StoryOrchestrator
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        createNotificationChannels()

        val database = AppDatabase.getInstance(this)
        settingsDataStore = SettingsDataStore(this)
        scrobbleRepository = ScrobbleRepository(database.scrobbleDao())
        storyRepository = StoryRepository(
            storyDao = database.storyDao(),
            storyHistoryDao = database.storyHistoryDao(),
            settingsDataStore = settingsDataStore,
        )
        mediaControllerManager = MediaControllerManager(this)
        storyPlayer = StoryPlayer(this)
        triggerEngine = TriggerEngine()
        storyOrchestrator = StoryOrchestrator(
            storyRepository = storyRepository,
            scrobbleRepository = scrobbleRepository,
            settingsDataStore = settingsDataStore,
            mediaControllerManager = mediaControllerManager,
            storyPlayer = storyPlayer,
            triggerEngine = triggerEngine,
        )
    }

    override fun onTerminate() {
        storyPlayer.release()
        super.onTerminate()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val monitorChannel = NotificationChannel(
            CHANNEL_MONITOR,
            getString(R.string.channel_monitor_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.channel_monitor_description)
        }
        manager.createNotificationChannel(monitorChannel)
    }

    companion object {
        const val CHANNEL_MONITOR = "monitor"

        @Volatile
        private var instance: MusicStoryApp? = null

        fun get(): MusicStoryApp = instance
            ?: throw IllegalStateException("MusicStoryApp not initialized")
    }
}
