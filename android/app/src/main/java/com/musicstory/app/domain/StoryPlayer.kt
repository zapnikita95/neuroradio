package com.musicstory.app.domain

import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.musicstory.app.data.model.StoryResponse
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
    private val exoPlayer: ExoPlayer = ExoPlayer.Builder(appContext).build()
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var resumeMusicOnFinish = true
    private var onFinishedCallback: (() -> Unit)? = null

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
                        _state.value = StoryPlaybackState.PLAYING
                    } else if (exoPlayer.playbackState == Player.STATE_READY) {
                        _state.value = StoryPlaybackState.PAUSED
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    _state.value = StoryPlaybackState.ERROR
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
                    engine.setSpeechRate(0.88f)
                    engine.setPitch(0.98f)
                    ttsReady = true
                    drainInitCallbacks()
                } else {
                    _state.value = StoryPlaybackState.ERROR
                    pendingInitCallbacks.clear()
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
        resumeMusic: Boolean = true,
        onFinished: (() -> Unit)? = null,
    ) {
        stopInternal(clearCallback = false)
        resumeMusicOnFinish = resumeMusic
        onFinishedCallback = onFinished
        _currentScript.value = response.script

        if (!audioUrl.isNullOrBlank()) {
            com.musicstory.app.util.StoryLog.i("Playing Yandex/server audio: $audioUrl")
            playWithExoPlayer(audioUrl)
        } else {
            com.musicstory.app.util.StoryLog.i("Playing Android TTS (${response.script.length} chars)")
            playWithTts(response.script)
        }
    }

    private fun playWithExoPlayer(url: String) {
        _state.value = StoryPlaybackState.PREPARING
        exoPlayer.setMediaItem(MediaItem.fromUri(url))
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    private fun playWithTts(script: String) {
        _state.value = StoryPlaybackState.PREPARING
        val startSpeaking = {
            val engine = tts
            if (engine == null || !ttsReady) {
                _state.value = StoryPlaybackState.ERROR
            } else {
                engine.setOnUtteranceProgressListener(
                    object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {
                            mainHandler.post {
                                _state.value = StoryPlaybackState.PLAYING
                            }
                        }

                        override fun onDone(utteranceId: String?) {
                            mainHandler.post {
                                _state.value = StoryPlaybackState.COMPLETED
                                invokeFinished()
                            }
                        }

                        @Deprecated("Deprecated in Java")
                        override fun onError(utteranceId: String?) {
                            mainHandler.post {
                                _state.value = StoryPlaybackState.ERROR
                            }
                        }

                        override fun onError(utteranceId: String?, errorCode: Int) {
                            mainHandler.post {
                                _state.value = StoryPlaybackState.ERROR
                            }
                        }
                    },
                )
                val params = Bundle().apply {
                    putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, UTTERANCE_ID)
                    putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
                }
                val result = engine.speak(script, TextToSpeech.QUEUE_FLUSH, params, UTTERANCE_ID)
                if (result == TextToSpeech.ERROR) {
                    _state.value = StoryPlaybackState.ERROR
                }
            }
        }

        if (ttsReady) {
            startSpeaking()
        } else {
            ensureTtsInitialized(startSpeaking)
        }
    }

    private fun invokeFinished() {
        onFinishedCallback?.invoke()
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
        _state.value = StoryPlaybackState.IDLE
        _currentScript.value = null
        if (clearCallback) {
            onFinishedCallback = null
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
