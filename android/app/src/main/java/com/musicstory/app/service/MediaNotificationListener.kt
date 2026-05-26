package com.musicstory.app.service

import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.media.MediaSessionSelector
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MediaNotificationListener : NotificationListenerService() {

    private val refreshScope = CoroutineScope(Dispatchers.Main.immediate)
    private var refreshJob: Job? = null

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
        connected.value = true
        val app = application as? MusicStoryApp
        app?.monitorLifecycle?.ensureListening()
        refreshSessionsImmediate()
    }

    override fun onListenerDisconnected() {
        connected.value = false
        instance = null
        super.onListenerDisconnected()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        if (MediaSessionSelector.isPreferredPackage(sbn.packageName)) {
            parseNotificationTrack(sbn)?.let { track ->
                if (notificationTrack.value?.displayKey != track.displayKey) {
                    lastNotificationUpdateMs = System.currentTimeMillis()
                }
                notificationTrack.value = track
                (application as? MusicStoryApp)?.mediaControllerManager?.syncEffectiveNowPlaying()
            }
            val app = application as? MusicStoryApp
            app?.monitorLifecycle?.tryWakeFromMusicApp(sbn.packageName)
            refreshSessionsDebounced()
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        sbn ?: return
        if (MediaSessionSelector.isPreferredPackage(sbn.packageName)) {
            refreshSessionsDebounced()
        }
    }

    private fun refreshSessionsDebounced() {
        refreshJob?.cancel()
        refreshJob = refreshScope.launch {
            delay(400)
            refreshSessionsImmediate()
        }
    }

    private fun refreshSessionsImmediate() {
        val app = application as? MusicStoryApp ?: return
        app.mediaControllerManager.refreshActiveController()
        app.mediaControllerManager.syncEffectiveNowPlaying()
        app.monitorLifecycle.tryWakeFromActiveMedia()
    }

    private fun parseNotificationTrack(sbn: StatusBarNotification): TrackInfo? {
        val extras = sbn.notification.extras
        val title = extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString()
        val text = extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString()
        val subText = extras.getCharSequence(android.app.Notification.EXTRA_SUB_TEXT)?.toString()

        val trackTitle = title?.takeIf { it.isNotBlank() } ?: return null
        val artist = text?.takeIf { it.isNotBlank() }
            ?: subText?.takeIf { it.isNotBlank() }
            ?: return null

        if (artist == trackTitle) return null

        return TrackInfo(
            artist = artist,
            title = trackTitle,
            packageName = sbn.packageName,
        )
    }

    companion object {
        @Volatile
        var instance: MediaNotificationListener? = null

        private val connected = MutableStateFlow(false)
        val isConnected: StateFlow<Boolean> = connected.asStateFlow()

        private val notificationTrack = MutableStateFlow<TrackInfo?>(null)
        val lastNotificationTrack: StateFlow<TrackInfo?> = notificationTrack.asStateFlow()

        @Volatile
        var lastNotificationUpdateMs: Long = 0L
            private set

        fun requestRebind(context: android.content.Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                requestRebind(android.content.ComponentName(context, MediaNotificationListener::class.java))
            }
        }
    }
}
