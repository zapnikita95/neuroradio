package com.musicstory.app.media

import android.content.ComponentName
import android.content.Context
import android.media.AudioManager
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.os.Handler
import android.os.Looper
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.service.MediaNotificationListener
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class MediaControllerManager(
    private val context: Context,
) {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val mainHandler = Handler(Looper.getMainLooper())
    private val sessionManager: MediaSessionManager =
        context.getSystemService(MediaSessionManager::class.java)
    private var fadedStreamOriginalVolume: Int? = null

    private var activeController: MediaController? = null
    private var sessionTrackUpdatedAtMs = 0L

    private val _nowPlaying = MutableStateFlow<TrackInfo?>(null)
    val nowPlaying: StateFlow<TrackInfo?> = _nowPlaying.asStateFlow()

    private val _effectiveNowPlaying = MutableStateFlow<TrackInfo?>(null)
    val effectiveNowPlaying: StateFlow<TrackInfo?> = _effectiveNowPlaying.asStateFlow()

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
        runOnMain { startOnMainThread() }
    }

    fun stop() {
        runOnMain { stopOnMainThread() }
    }

    fun refreshActiveController() {
        runOnMain { refreshActiveControllerOnMainThread() }
    }

    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            block()
        } else {
            mainHandler.post(block)
        }
    }

    private fun startOnMainThread() {
        if (!hasNotificationAccess()) return
        try {
            val component = ComponentName(context, MediaNotificationListener::class.java)
            sessionManager.addOnActiveSessionsChangedListener(sessionListener, component)
            refreshActiveControllerOnMainThread()
        } catch (_: SecurityException) {
            // Notification listener not granted
        }
    }

    private fun stopOnMainThread() {
        try {
            sessionManager.removeOnActiveSessionsChangedListener(sessionListener)
        } catch (_: Exception) {
            // ignore
        }
        unbindController()
    }

    private fun refreshActiveControllerOnMainThread() {
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

  suspend fun fadeOutAndPause(seconds: Float) {
        val controls = activeController?.transportControls
        if (controls == null) {
            return
        }
        val currentVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        if (currentVolume <= 0) {
            controls.pause()
            return
        }
        if (fadedStreamOriginalVolume == null) {
            fadedStreamOriginalVolume = currentVolume
        }
        val targetVolume = 0
        if (seconds <= 0.2f) {
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, targetVolume, 0)
            controls.pause()
            return
        }
        val steps = (seconds * 12f).toInt().coerceIn(8, 20)
        val stepDelayMs = ((seconds * 1000f) / steps).toLong().coerceAtLeast(40L)
        for (step in 1..steps) {
            val vol = (currentVolume - (currentVolume - targetVolume) * step / steps)
                .coerceAtLeast(0)
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, vol, 0)
            delay(stepDelayMs)
        }
        controls.pause()
    }

    /** Call when story ends, track changes, or user stops — fixes stuck silent STREAM_MUSIC. */
    fun restoreSystemMusicVolumeIfNeeded() {
        val original = fadedStreamOriginalVolume ?: return
        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val restore = original.coerceIn(1, max)
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, restore, 0)
        fadedStreamOriginalVolume = null
    }

    suspend fun resumeMusicWithFade(seconds: Float) {
        restoreSystemMusicVolumeIfNeeded()
        val controls = activeController?.transportControls ?: return
        val maxVolume = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val original = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        val startVolume = (maxVolume * 0.08f).toInt().coerceAtLeast(1)
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, startVolume, 0)
        controls.play()
        if (seconds <= 0.2f) {
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, original, 0)
            return
        }
        val steps = (seconds * 10f).toInt().coerceIn(6, 15)
        val stepDelayMs = ((seconds * 1000f) / steps).toLong().coerceAtLeast(50L)
        for (i in 1..steps) {
            val vol = (startVolume + (original - startVolume) * i / steps).coerceAtMost(original)
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, vol, 0)
            delay(stepDelayMs)
        }
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, original, 0)
    }

    fun resumeMusic() {
        restoreSystemMusicVolumeIfNeeded()
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
            .filter { MediaSessionSelector.isAllowedMusicPackage(it.packageName) }

        val musicApps = list

        val controller = musicApps
            .filter { hasValidMetadata(it) && isPlaying(it) }
            .minByOrNull { MediaSessionSelector.priority(it.packageName) }
            ?: musicApps
                .filter { hasValidMetadata(it) }
                .minByOrNull { MediaSessionSelector.priority(it.packageName) }

        if (controller?.sessionToken == activeController?.sessionToken) {
            updateFromController(controller)
            return
        }

        unbindController()
        activeController = controller
        controller?.registerCallback(controllerCallback)
        updateFromController(controller)
    }

    private fun hasValidMetadata(controller: MediaController): Boolean {
        val metadata = controller.metadata ?: return false
        val artist = metadata.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST)
            ?: metadata.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
            ?: ""
        val title = metadata.getString(android.media.MediaMetadata.METADATA_KEY_TITLE) ?: ""
        return artist.isNotBlank() && title.isNotBlank() && artist != title
    }

    private fun isPlaying(controller: MediaController): Boolean {
        return controller.playbackState?.state == android.media.session.PlaybackState.STATE_PLAYING
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
            syncEffectiveNowPlaying()
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
            val next = TrackInfo(
                artist = artist,
                title = title,
                album = album,
                packageName = controller.packageName,
                durationMs = duration,
            )
            if (_nowPlaying.value?.displayKey != next.displayKey) {
                sessionTrackUpdatedAtMs = System.currentTimeMillis()
            }
            _nowPlaying.value = next
        }

        val state = controller.playbackState?.state
        _isPlaying.value = state == android.media.session.PlaybackState.STATE_PLAYING
        syncEffectiveNowPlaying()
    }

    fun syncEffectiveNowPlaying() {
        val session = _nowPlaying.value?.takeIf { it.isValid() }
        val fromNotification = MediaNotificationListener.lastNotificationTrack.value?.takeIf { it.isValid() }
        _effectiveNowPlaying.value = pickBestTrack(session, fromNotification)
    }

    /** Fresh track for story API — avoids stale MediaSession metadata (e.g. old «Кино» while 50 Cent plays). */
    fun resolveNowPlayingTrack(): TrackInfo? = pickBestTrack(
        _nowPlaying.value?.takeIf { it.isValid() },
        MediaNotificationListener.lastNotificationTrack.value?.takeIf { it.isValid() },
    )

    private fun pickBestTrack(session: TrackInfo?, notification: TrackInfo?): TrackInfo? {
        val safeSession = session?.takeIf { MediaSessionSelector.isAllowedMusicPackage(it.packageName) }
        val safeNotification = notification?.takeIf { MediaSessionSelector.isAllowedMusicPackage(it.packageName) }
        when {
            safeSession == null -> return safeNotification
            safeNotification == null -> return safeSession
            safeSession.displayKey == safeNotification.displayKey -> return safeSession
            _isPlaying.value && safeSession.packageName != null &&
                safeSession.packageName == _activePackage.value -> {
                val notifAt = MediaNotificationListener.lastNotificationUpdateMs
                return if (notifAt > sessionTrackUpdatedAtMs) safeNotification else safeSession
            }
            else -> {
                val notifAt = MediaNotificationListener.lastNotificationUpdateMs
                return if (notifAt >= sessionTrackUpdatedAtMs) safeNotification else safeSession
            }
        }
    }
}
