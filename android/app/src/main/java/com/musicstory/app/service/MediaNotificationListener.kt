package com.musicstory.app.service

import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.musicstory.app.MusicStoryApp
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.media.MediaSessionSelector
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MediaNotificationListener : NotificationListenerService() {

    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
        connected.value = true
        refreshSessions()
    }

    override fun onListenerDisconnected() {
        connected.value = false
        instance = null
        super.onListenerDisconnected()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        if (!MediaSessionSelector.isPreferredPackage(sbn.packageName)) return
        parseNotificationTrack(sbn)?.let { track ->
            notificationTrack.value = track
        }
        refreshSessions()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        refreshSessions()
    }

    private fun refreshSessions() {
        val app = application as? MusicStoryApp ?: return
        app.mediaControllerManager.refreshActiveController()
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

        fun requestRebind(context: android.content.Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                requestRebind(android.content.ComponentName(context, MediaNotificationListener::class.java))
            }
        }
    }
}
