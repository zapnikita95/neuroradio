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
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
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

/** Server-only playback: Yandex TTS on Railway → signed audio URL → ExoPlayer. No Android TextToSpeech. */
class StoryPlayer(context: Context) {

    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null
    private val exoPlayer: ExoPlayer = ExoPlayer.Builder(appContext)
        .setAudioAttributes(
            MediaAudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build(),
            true,
        )
        .build()

    private var resumeMusicOnFinish = true
    private var onFinishedCallback: (() -> Unit)? = null
    private var onErrorCallback: (() -> Unit)? = null
    private var onPlaybackStartedCallback: (() -> Unit)? = null
    private var playbackStartedNotified = false
    private var exoRetryUsed = false
    private var currentExoUrl: String? = null
    private var playbackTimeoutRunnable: Runnable? = null

    private val _state = MutableStateFlow(StoryPlaybackState.IDLE)
    val state: StateFlow<StoryPlaybackState> = _state.asStateFlow()

    private val _currentScript = MutableStateFlow<String?>(null)
    val currentScript: StateFlow<String?> = _currentScript.asStateFlow()

    init {
        exoPlayer.addListener(
            object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_BUFFERING -> _state.value = StoryPlaybackState.PREPARING
                        Player.STATE_READY -> {
                            if (exoPlayer.isPlaying) {
                                _state.value = StoryPlaybackState.PLAYING
                            }
                        }
                        Player.STATE_ENDED -> {
                            cancelPlaybackTimeout()
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
                    } else if (exoPlayer.playbackState == Player.STATE_READY) {
                        _state.value = StoryPlaybackState.PAUSED
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    StoryLog.e("ExoPlayer error (Yandex server audio): ${error.message}", error)
                    if (!exoRetryUsed) {
                        exoRetryUsed = true
                        val retryUrl = currentExoUrl
                        if (!retryUrl.isNullOrBlank()) {
                            StoryLog.w("ExoPlayer error — retrying server audio once")
                            exoPlayer.stop()
                            exoPlayer.clearMediaItems()
                            playWithExoPlayer(retryUrl)
                            return
                        }
                    }
                    failPlayback()
                }
            },
        )
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
        exoRetryUsed = false
        _currentScript.value = response.script

        if (audioUrl.isNullOrBlank()) {
            StoryLog.e("No server audioUrl — Yandex TTS on Railway is required; Android TTS is not used")
            _state.value = StoryPlaybackState.ERROR
            invokeError()
            return
        }

        if (!requestAudioFocus()) {
            StoryLog.w("Audio focus not granted — trying playback anyway")
        }

        StoryLog.i("Playing Yandex server audio: $audioUrl")
        playWithExoPlayer(audioUrl)
    }

    private fun playWithExoPlayer(url: String) {
        currentExoUrl = url
        _state.value = StoryPlaybackState.PREPARING
        scheduleExoBufferingTimeout()
        exoPlayer.setMediaItem(MediaItem.fromUri(url))
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    private fun scheduleExoBufferingTimeout() {
        cancelPlaybackTimeout()
        playbackTimeoutRunnable = Runnable {
            if (_state.value != StoryPlaybackState.PREPARING &&
                _state.value != StoryPlaybackState.PLAYING
            ) {
                return@Runnable
            }
            if (exoPlayer.isPlaying) {
                return@Runnable
            }
            if (!exoRetryUsed) {
                exoRetryUsed = true
                StoryLog.w("ExoPlayer start timeout — retrying server audio once")
                exoPlayer.stop()
                exoPlayer.clearMediaItems()
                val retryUrl = currentExoUrl
                if (!retryUrl.isNullOrBlank()) {
                    playWithExoPlayer(retryUrl)
                    return@Runnable
                }
            }
            StoryLog.e("ExoPlayer start timeout after retry (Yandex server audio)")
            failPlayback()
        }
        mainHandler.postDelayed(playbackTimeoutRunnable!!, EXO_START_TIMEOUT_MS)
    }

    private fun failPlayback() {
        exoPlayer.stop()
        exoPlayer.clearMediaItems()
        _state.value = StoryPlaybackState.ERROR
        abandonAudioFocus()
        invokeError()
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
        if (exoPlayer.isPlaying) {
            exoPlayer.pause()
            _state.value = StoryPlaybackState.PAUSED
        }
    }

    fun resume() {
        if (exoPlayer.mediaItemCount > 0) {
            exoPlayer.play()
        }
    }

    fun stop() {
        stopInternal(clearCallback = true)
    }

    private fun stopInternal(clearCallback: Boolean) {
        cancelPlaybackTimeout()
        exoPlayer.stop()
        exoPlayer.clearMediaItems()
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
        exoPlayer.release()
    }

    companion object {
        private const val EXO_START_TIMEOUT_MS = 28_000L
    }
}
