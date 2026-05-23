package com.musicstory.app.domain

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
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
import java.util.Locale
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicBoolean

enum class StoryPlaybackState {
    IDLE,
    PREPARING,
    PLAYING,
    PAUSED,
    COMPLETED,
    ERROR,
}

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
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var resumeMusicOnFinish = true
    private var onFinishedCallback: (() -> Unit)? = null
    private var onErrorCallback: (() -> Unit)? = null
    private var onPlaybackStartedCallback: (() -> Unit)? = null
    private var playbackStartedNotified = false
    private var pendingScript: String? = null
    private var pendingSpeechRate = 0.92f

    private val _state = MutableStateFlow(StoryPlaybackState.IDLE)
    val state: StateFlow<StoryPlaybackState> = _state.asStateFlow()

    private val _currentScript = MutableStateFlow<String?>(null)
    val currentScript: StateFlow<String?> = _currentScript.asStateFlow()

    private val ttsInitStarted = AtomicBoolean(false)
    private val pendingInitCallbacks = ConcurrentLinkedQueue<() -> Unit>()

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
                        notifyPlaybackStarted()
                        _state.value = StoryPlaybackState.PLAYING
                    } else if (exoPlayer.playbackState == Player.STATE_READY) {
                        _state.value = StoryPlaybackState.PAUSED
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    StoryLog.e("ExoPlayer error: ${error.message}", error)
                    val script = pendingScript
                    if (!script.isNullOrBlank()) {
                        StoryLog.w("Falling back to Android TTS after server audio failed")
                        playWithTts(script, pendingSpeechRate)
                    } else {
                        _state.value = StoryPlaybackState.ERROR
                        abandonAudioFocus()
                        invokeError()
                    }
                }
            },
        )

        ensureTtsInitialized()
    }

    fun ensureTtsInitialized(onReady: (() -> Unit)? = null) {
        if (ttsReady) {
            onReady?.invoke()
            return
        }
        onReady?.let { pendingInitCallbacks.add(it) }
        if (!ttsInitStarted.compareAndSet(false, true)) return

        tts = TextToSpeech(appContext) { status ->
            mainHandler.post {
                if (status == TextToSpeech.SUCCESS) {
                    val engine = tts ?: return@post
                    engine.language = Locale("ru", "RU")
                    engine.setSpeechRate(0.92f)
                    engine.setPitch(0.98f)
                    ttsReady = true
                    drainInitCallbacks()
                } else {
                    StoryLog.e("Android TTS init failed: status=$status")
                    _state.value = StoryPlaybackState.ERROR
                    pendingInitCallbacks.clear()
                    invokeError()
                }
            }
        }
    }

    private fun drainInitCallbacks() {
        while (true) {
            val cb = pendingInitCallbacks.poll() ?: break
            cb.invoke()
        }
    }

    fun playStory(
        response: StoryResponse,
        audioUrl: String?,
        speechRate: Float = 0.92f,
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
        pendingScript = response.script
        pendingSpeechRate = speechRate
        _currentScript.value = response.script

        if (!requestAudioFocus()) {
            StoryLog.w("Audio focus not granted — trying playback anyway")
        }

        if (!audioUrl.isNullOrBlank()) {
            StoryLog.i("Playing server audio: $audioUrl")
            playWithExoPlayer(audioUrl)
        } else {
            StoryLog.i("Playing Android TTS (${response.script.length} chars)")
            playWithTts(response.script, speechRate)
        }
    }

    private fun playWithExoPlayer(url: String) {
        _state.value = StoryPlaybackState.PREPARING
        exoPlayer.setMediaItem(MediaItem.fromUri(url))
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    private fun playWithTts(script: String, speechRate: Float) {
        _state.value = StoryPlaybackState.PREPARING
        val startSpeaking = {
            val engine = tts
            if (engine == null || !ttsReady) {
                StoryLog.e("Android TTS not ready")
                _state.value = StoryPlaybackState.ERROR
                abandonAudioFocus()
                invokeError()
            } else {
                engine.setSpeechRate(speechRate)
                engine.setOnUtteranceProgressListener(
                    object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {
                            mainHandler.post {
                                notifyPlaybackStarted()
                                _state.value = StoryPlaybackState.PLAYING
                            }
                        }

                        override fun onDone(utteranceId: String?) {
                            mainHandler.post {
                                _state.value = StoryPlaybackState.COMPLETED
                                abandonAudioFocus()
                                invokeFinished()
                            }
                        }

                        @Deprecated("Deprecated in Java")
                        override fun onError(utteranceId: String?) {
                            mainHandler.post {
                                StoryLog.e("Android TTS speak error")
                                _state.value = StoryPlaybackState.ERROR
                                abandonAudioFocus()
                                invokeError()
                            }
                        }

                        override fun onError(utteranceId: String?, errorCode: Int) {
                            mainHandler.post {
                                StoryLog.e("Android TTS speak error: code=$errorCode")
                                _state.value = StoryPlaybackState.ERROR
                                abandonAudioFocus()
                                invokeError()
                            }
                        }
                    },
                )
                val params = Bundle().apply {
                    putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, UTTERANCE_ID)
                    putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
                    putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC)
                }
                val result = engine.speak(script, TextToSpeech.QUEUE_FLUSH, params, UTTERANCE_ID)
                if (result == TextToSpeech.ERROR) {
                    StoryLog.e("Android TTS speak returned ERROR")
                    _state.value = StoryPlaybackState.ERROR
                    abandonAudioFocus()
                    invokeError()
                }
            }
        }

        if (ttsReady) {
            startSpeaking()
        } else {
            ensureTtsInitialized(startSpeaking)
        }
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
        } else {
            tts?.stop()
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
        exoPlayer.stop()
        exoPlayer.clearMediaItems()
        tts?.stop()
        abandonAudioFocus()
        _state.value = StoryPlaybackState.IDLE
        _currentScript.value = null
        pendingScript = null
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
        tts?.shutdown()
        tts = null
        ttsReady = false
        ttsInitStarted.set(false)
        pendingInitCallbacks.clear()
    }

    companion object {
        private const val UTTERANCE_ID = "music_story_utterance"
    }
}
