package com.musicstory.app.media

import android.content.ComponentName
import android.content.Context
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.service.MediaNotificationListener
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MediaControllerManager(
    private val context: Context,
) {
    private val sessionManager: MediaSessionManager =
        context.getSystemService(MediaSessionManager::class.java)

    private var activeController: MediaController? = null

    private val _nowPlaying = MutableStateFlow<TrackInfo?>(null)
    val nowPlaying: StateFlow<TrackInfo?> = _nowPlaying.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _activePackage = MutableStateFlow<String?>(null)
    val activePackage: StateFlow<String?> = _activePackage.asStateFlow()

    private val controllerCallback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: android.media.MediaMetadata?) {
            updateFromController(activeController)
        }

        override fun onPlaybackStateChanged(state: android.media.session.PlaybackState?) {
            _isPlaying.value = state?.state == android.media.session.PlaybackState.STATE_PLAYING
            updateFromController(activeController)
        }

        override fun onSessionDestroyed() {
            refreshActiveController()
        }
    }

    private val sessionListener = MediaSessionManager.OnActiveSessionsChangedListener { controllers ->
        selectAndBindController(controllers)
    }

    fun start() {
        if (!hasNotificationAccess()) return
        try {
            val component = ComponentName(context, MediaNotificationListener::class.java)
            sessionManager.addOnActiveSessionsChangedListener(sessionListener, component)
            refreshActiveController()
        } catch (_: SecurityException) {
            // Notification listener not granted
        }
    }

    fun stop() {
        try {
            sessionManager.removeOnActiveSessionsChangedListener(sessionListener)
        } catch (_: Exception) {
            // ignore
        }
        unbindController()
    }

    fun refreshActiveController() {
        if (!hasNotificationAccess()) return
        try {
            val component = ComponentName(context, MediaNotificationListener::class.java)
            val controllers = sessionManager.getActiveSessions(component)
            selectAndBindController(controllers)
        } catch (_: SecurityException) {
            // ignore
        }
    }

    fun pauseMusic() {
        activeController?.transportControls?.pause()
    }

    fun resumeMusic() {
        activeController?.transportControls?.play()
    }

    fun hasNotificationAccess(): Boolean {
        val enabledListeners = android.provider.Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners",
        ) ?: return false
        val component = ComponentName(context, MediaNotificationListener::class.java)
        return enabledListeners.contains(component.flattenToString(), ignoreCase = true)
    }

    private fun selectAndBindController(controllers: List<MediaController>?) {
        val list = controllers.orEmpty()
        val preferred = list
            .filter { MediaSessionSelector.isPreferredPackage(it.packageName) }
            .sortedBy { MediaSessionSelector.priority(it.packageName) }

        val controller = preferred.firstOrNull()
            ?: list.firstOrNull { it.playbackState?.state == android.media.session.PlaybackState.STATE_PLAYING }
            ?: list.firstOrNull()

        if (controller?.sessionToken == activeController?.sessionToken) {
            updateFromController(controller)
            return
        }

        unbindController()
        activeController = controller
        controller?.registerCallback(controllerCallback)
        updateFromController(controller)
    }

    private fun unbindController() {
        activeController?.unregisterCallback(controllerCallback)
        activeController = null
    }

    private fun updateFromController(controller: MediaController?) {
        if (controller == null) {
            _nowPlaying.value = null
            _isPlaying.value = false
            _activePackage.value = null
            return
        }

        _activePackage.value = controller.packageName
        val metadata = controller.metadata
        val artist = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST)
            ?: metadata?.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
            ?: ""
        val title = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_TITLE) ?: ""
        val album = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM)
        val duration = metadata?.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION) ?: 0L

        if (artist.isNotBlank() && title.isNotBlank()) {
            _nowPlaying.value = TrackInfo(
                artist = artist,
                title = title,
                album = album,
                packageName = controller.packageName,
                durationMs = duration,
            )
        }

        val state = controller.playbackState?.state
        _isPlaying.value = state == android.media.session.PlaybackState.STATE_PLAYING
    }
}
