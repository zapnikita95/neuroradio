package com.musicstory.app.domain

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes as MediaAudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class StoryPlaybackState {
    IDLE,
    PREPARING,
    PLAYING,
    PAUSED,
    COMPLETED,
    ERROR,
}

/** Server audio only — Edge or Yandex SpeechKit via signed URL (ExoPlayer). */
class StoryPlayer(context: Context) {

    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null
    private val httpDataSourceFactory = DefaultHttpDataSource.Factory()
        .setUserAgent("MusicStory/${com.musicstory.app.BuildConfig.VERSION_NAME} (Android)")
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(30_000)
        .setReadTimeoutMs(120_000)

    /** HTTP for signed URLs + file/content for premium offline cache. */
    private val dataSourceFactory = DefaultDataSource.Factory(appContext, httpDataSourceFactory)

    /** Lazy init — ExoPlayer native libs can crash some devices at cold start (16KB page size, OEM builds). */
    private var exoPlayer: ExoPlayer? = null

    private var resumeMusicOnFinish = true
    private var onFinishedCallback: (() -> Unit)? = null
    private var onErrorCallback: (() -> Unit)? = null
    private var onPlaybackStartedCallback: (() -> Unit)? = null
    private var playbackStartedNotified = false
    private var exoRetryCount = 0
    private var currentExoUrl: String? = null
    private var playbackTimeoutRunnable: Runnable? = null

    private val _state = MutableStateFlow(StoryPlaybackState.IDLE)
    val state: StateFlow<StoryPlaybackState> = _state.asStateFlow()

    /** 0..1 — position / duration while server audio plays. */
    private val _playbackProgress = MutableStateFlow(0f)
    val playbackProgress: StateFlow<Float> = _playbackProgress.asStateFlow()

    private val _currentScript = MutableStateFlow<String?>(null)
    val currentScript: StateFlow<String?> = _currentScript.asStateFlow()

    private var progressPollRunnable: Runnable? = null

    private fun ensurePlayer(): ExoPlayer {
        exoPlayer?.let { return it }
        val player = ExoPlayer.Builder(appContext)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSourceFactory))
            .setAudioAttributes(
                MediaAudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                    .build(),
                true,
            )
            .build()
        player.addListener(
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_BUFFERING -> _state.value = StoryPlaybackState.PREPARING
                        Player.STATE_READY -> {
                            if (player.isPlaying) {
                                _state.value = StoryPlaybackState.PLAYING
                            }
                        }
                        Player.STATE_ENDED -> {
                            cancelPlaybackTimeout()
                            stopProgressPolling()
                            _playbackProgress.value = 1f
                            _state.value = StoryPlaybackState.COMPLETED
                            abandonAudioFocus()
                            invokeFinished()
                        }
                        Player.STATE_IDLE -> {
                            if (_state.value != StoryPlaybackState.ERROR) {
                                _state.value = StoryPlaybackState.IDLE
                            }
                        }
                    }
                }

                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    if (isPlaying) {
                        cancelPlaybackTimeout()
                        notifyPlaybackStarted()
                        _state.value = StoryPlaybackState.PLAYING
                        startProgressPolling()
                    } else if (player.playbackState == Player.STATE_READY) {
                        _state.value = StoryPlaybackState.PAUSED
                        stopProgressPolling()
                    } else {
                        stopProgressPolling()
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    StoryLog.e(
                        "ExoPlayer error (server audio): code=${error.errorCode} " +
                            "cause=${error.cause?.javaClass?.simpleName} msg=${error.message}",
                        error,
                    )
                    if (retryExoSameUrl("player error")) return
                    failPlayback()
                }
            },
        )
        exoPlayer = player
        return player
    }

    fun playStory(
        response: StoryResponse,
        audioUrl: String?,
        @Suppress("UNUSED_PARAMETER") speechRate: Float = 0.92f,
        resumeMusic: Boolean = true,
        onPlaybackStarted: (() -> Unit)? = null,
        onFinished: (() -> Unit)? = null,
        onError: (() -> Unit)? = null,
    ) {
        stopInternal(clearCallback = false)
        resumeMusicOnFinish = resumeMusic
        onFinishedCallback = onFinished
        onErrorCallback = onError
        onPlaybackStartedCallback = onPlaybackStarted
        playbackStartedNotified = false
        exoRetryCount = 0
        _playbackProgress.value = 0f
        _currentScript.value = response.script

        if (!requestAudioFocus()) {
            StoryLog.w("Audio focus not granted — trying playback anyway")
        }

        if (audioUrl.isNullOrBlank()) {
            StoryLog.e("No server audioUrl — check Edge/Yandex TTS on Railway")
            _state.value = StoryPlaybackState.ERROR
            invokeError()
            return
        }
        try {
            val isLocalFile = audioUrl.startsWith("file://") || audioUrl.startsWith("content://")
            StoryLog.i("Playing server audio (${if (isLocalFile) "local" else "stream"}): ${audioUrl.take(120)}")
            playWithExoPlayer(audioUrl)
        } catch (e: Exception) {
            StoryLog.e("ExoPlayer init/play failed", e)
            _state.value = StoryPlaybackState.ERROR
            invokeError()
        }
    }

    private fun retryExoSameUrl(reason: String): Boolean {
        val player = exoPlayer ?: return false
        if (playbackStartedNotified || player.currentPosition > 1_500L) {
            StoryLog.w(
                "ExoPlayer $reason after playback started (pos=${player.currentPosition}ms) — no restart",
            )
            return false
        }
        if (exoRetryCount >= MAX_EXO_URL_RETRIES) return false
        val retryUrl = currentExoUrl
        if (retryUrl.isNullOrBlank()) return false
        exoRetryCount++
        StoryLog.w("ExoPlayer $reason — retry $exoRetryCount/$MAX_EXO_URL_RETRIES before first audio")
        player.stop()
        player.clearMediaItems()
        playbackStartedNotified = false
        playWithExoPlayer(retryUrl)
        return true
    }

    private fun playWithExoPlayer(url: String) {
        val player = ensurePlayer()
        currentExoUrl = url
        _state.value = StoryPlaybackState.PREPARING
        scheduleExoBufferingTimeout()
        val mimeType = mimeTypeForPlaybackUrl(url)
        val mediaItemBuilder = MediaItem.Builder().setUri(url)
        if (mimeType != null) {
            mediaItemBuilder.setMimeType(mimeType)
        }
        player.setMediaItem(mediaItemBuilder.build())
        player.volume = 1f
        player.prepare()
        player.playWhenReady = true
    }

    private fun scheduleExoBufferingTimeout() {
        cancelPlaybackTimeout()
        playbackTimeoutRunnable = Runnable {
            if (_state.value != StoryPlaybackState.PREPARING &&
                _state.value != StoryPlaybackState.PLAYING
            ) {
                return@Runnable
            }
            val player = exoPlayer
            if (player?.isPlaying == true) {
                return@Runnable
            }
            if (retryExoSameUrl("start timeout")) return@Runnable
            StoryLog.e("ExoPlayer start timeout after retries (server audio)")
            failPlayback()
        }
        mainHandler.postDelayed(playbackTimeoutRunnable!!, EXO_START_TIMEOUT_MS)
    }

    private fun failPlayback() {
        stopActiveEngine()
        _state.value = StoryPlaybackState.ERROR
        abandonAudioFocus()
        invokeError()
    }

    private fun startProgressPolling() {
        stopProgressPolling()
        progressPollRunnable = object : Runnable {
            override fun run() {
                val player = exoPlayer ?: return
                val duration = player.duration
                if (duration > 0L) {
                    _playbackProgress.value =
                        (player.currentPosition.toFloat() / duration).coerceIn(0f, 1f)
                }
                val playing = player.isPlaying
                val buffering = player.playbackState == Player.STATE_BUFFERING
                if (playing || buffering) {
                    mainHandler.postDelayed(this, 50L)
                }
            }
        }
        mainHandler.post(progressPollRunnable!!)
    }

    private fun stopProgressPolling() {
        progressPollRunnable?.let { mainHandler.removeCallbacks(it) }
        progressPollRunnable = null
    }

    private fun stopActiveEngine() {
        cancelPlaybackTimeout()
        stopProgressPolling()
        exoPlayer?.stop()
        exoPlayer?.clearMediaItems()
    }

    private fun cancelPlaybackTimeout() {
        playbackTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        playbackTimeoutRunnable = null
    }

    private fun requestAudioFocus(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener { }
                .build()
            return audioManager.requestAudioFocus(audioFocusRequest!!) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
        @Suppress("DEPRECATION")
        return audioManager.requestAudioFocus(
            null,
            AudioManager.STREAM_MUSIC,
            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
        ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private fun abandonAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
    }

    private fun notifyPlaybackStarted() {
        if (playbackStartedNotified) return
        playbackStartedNotified = true
        onPlaybackStartedCallback?.invoke()
        onPlaybackStartedCallback = null
    }

    private fun invokeFinished() {
        onFinishedCallback?.invoke()
        onFinishedCallback = null
        onErrorCallback = null
    }

    private fun invokeError() {
        onErrorCallback?.invoke()
        onErrorCallback = null
        onFinishedCallback = null
    }

    fun pause() {
        val player = exoPlayer ?: return
        if (player.isPlaying) {
            player.pause()
            _state.value = StoryPlaybackState.PAUSED
        }
    }

    fun resume() {
        val player = exoPlayer ?: return
        if (player.mediaItemCount > 0) {
            player.play()
        }
    }

    fun stop() {
        stopInternal(clearCallback = true)
    }

    private fun stopInternal(clearCallback: Boolean) {
        stopActiveEngine()
        abandonAudioFocus()
        _state.value = StoryPlaybackState.IDLE
        _currentScript.value = null
        currentExoUrl = null
        playbackStartedNotified = false
        onPlaybackStartedCallback = null
        if (clearCallback) {
            onFinishedCallback = null
            onErrorCallback = null
        }
    }

    fun shouldResumeMusic(): Boolean = resumeMusicOnFinish

    fun release() {
        stop()
        exoPlayer?.release()
        exoPlayer = null
    }

    companion object {
        private const val EXO_START_TIMEOUT_MS = 180_000L
        /** One retry only if audio never started — avoids triple restart mid-playback. */
        private const val MAX_EXO_URL_RETRIES = 1

        private fun mimeTypeForPlaybackUrl(url: String): String? {
            val path = url.substringBefore('?').lowercase()
            return when {
                path.endsWith(".wav") -> MimeTypes.AUDIO_WAV
                // Sniff OGG/Opus — explicit AUDIO_OGG breaks playback on some Xiaomi/POCO builds.
                path.endsWith(".ogg") -> null
                else -> null
            }
        }
    }
}
