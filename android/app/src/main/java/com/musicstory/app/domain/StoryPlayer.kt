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
    private var ttsPlainFallbackUsed = false
    private var usedServerAudio = false
    private var exoRetryUsed = false
    private var currentExoUrl: String? = null
    private var playbackTimeoutRunnable: Runnable? = null
    private var ttsStartTimeoutRunnable: Runnable? = null

    private val _state = MutableStateFlow(StoryPlaybackState.IDLE)
    val state: StateFlow<StoryPlaybackState> = _state.asStateFlow()

    /** True when the last [playStory] call used Yandex audio from the backend (ExoPlayer path). */
    fun lastPlaybackUsedServerAudio(): Boolean = usedServerAudio

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
                            cancelAllPlaybackTimeouts()
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
                        cancelPlaybackTimeouts()
                        notifyPlaybackStarted()
                        _state.value = StoryPlaybackState.PLAYING
                    } else if (exoPlayer.playbackState == Player.STATE_READY) {
                        _state.value = StoryPlaybackState.PAUSED
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    StoryLog.e("ExoPlayer error: ${error.message}", error)
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
                    _state.value = StoryPlaybackState.ERROR
                    abandonAudioFocus()
                    invokeError()
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
        ttsPlainFallbackUsed = false
        exoRetryUsed = false
        usedServerAudio = !audioUrl.isNullOrBlank()
        _currentScript.value = response.script

        if (!requestAudioFocus()) {
            StoryLog.w("Audio focus not granted — trying playback anyway")
        }

        if (!audioUrl.isNullOrBlank()) {
            StoryLog.i("Playing server audio: $audioUrl")
            playWithExoPlayer(audioUrl)
        } else {
            usedServerAudio = false
            StoryLog.i("Playing Android TTS (${response.script.length} chars)")
            playWithTts(response.script, speechRate)
        }
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
        cancelPlaybackTimeouts()
        playbackTimeoutRunnable = Runnable {
            if (_state.value != StoryPlaybackState.PREPARING &&
                _state.value != StoryPlaybackState.PLAYING
            ) {
                return@Runnable
            }
            if (exoPlayer.isPlaying) {
                return@Runnable
            }
            val script = pendingScript
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
            StoryLog.w("ExoPlayer start timeout after retry")
            exoPlayer.stop()
            exoPlayer.clearMediaItems()
            _state.value = StoryPlaybackState.ERROR
            abandonAudioFocus()
            invokeError()
        }
        mainHandler.postDelayed(playbackTimeoutRunnable!!, EXO_START_TIMEOUT_MS)
    }

    private fun scheduleTtsStartTimeout() {
        cancelTtsStartTimeout()
        ttsStartTimeoutRunnable = Runnable {
            if (_state.value == StoryPlaybackState.PREPARING && !playbackStartedNotified) {
                StoryLog.e("Android TTS start timeout")
                _state.value = StoryPlaybackState.ERROR
                abandonAudioFocus()
                invokeError()
            }
        }
        mainHandler.postDelayed(ttsStartTimeoutRunnable!!, TTS_START_TIMEOUT_MS)
    }

    private fun cancelPlaybackTimeouts() {
        playbackTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        playbackTimeoutRunnable = null
    }

    private fun cancelTtsStartTimeout() {
        ttsStartTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        ttsStartTimeoutRunnable = null
    }

    private fun cancelAllPlaybackTimeouts() {
        cancelPlaybackTimeouts()
        cancelTtsStartTimeout()
    }

    private fun playWithTts(script: String, speechRate: Float) {
        _state.value = StoryPlaybackState.PREPARING
        scheduleTtsStartTimeout()
        val segments = TtsScriptSegmenter.split(script)
        val startSpeaking = {
            val engine = tts
            if (engine == null || !ttsReady) {
                StoryLog.e("Android TTS not ready")
                _state.value = StoryPlaybackState.ERROR
                abandonAudioFocus()
                invokeError()
            } else {
                engine.setSpeechRate(speechRate)
                if (segments.isEmpty()) {
                    StoryLog.e("Android TTS: empty script")
                    _state.value = StoryPlaybackState.ERROR
                    abandonAudioFocus()
                    invokeError()
                } else {
                var segmentIndex = 0
                engine.setOnUtteranceProgressListener(
                    object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {
                            mainHandler.post {
                                cancelTtsStartTimeout()
                                notifyPlaybackStarted()
                                _state.value = StoryPlaybackState.PLAYING
                            }
                        }

                        override fun onDone(utteranceId: String?) {
                            mainHandler.post {
                                segmentIndex++
                                if (segmentIndex >= segments.size) {
                                    cancelAllPlaybackTimeouts()
                                    _state.value = StoryPlaybackState.COMPLETED
                                    abandonAudioFocus()
                                    invokeFinished()
                                } else {
                                    speakSegment(engine, segments[segmentIndex], segmentIndex, speechRate)
                                }
                            }
                        }

                        @Deprecated("Deprecated in Java")
                        override fun onError(utteranceId: String?) {
                            mainHandler.post { handleTtsError(engine, segments, segmentIndex, speechRate) }
                        }

                        override fun onError(utteranceId: String?, errorCode: Int) {
                            mainHandler.post { handleTtsError(engine, segments, segmentIndex, speechRate) }
                        }
                    },
                )
                speakSegment(engine, segments[0], 0, speechRate)
                }
            }
        }

        if (ttsReady) {
            startSpeaking()
        } else {
            ensureTtsInitialized(startSpeaking)
        }
    }

    private fun speakSegment(
        engine: TextToSpeech,
        segment: TtsScriptSegmenter.Segment,
        index: Int,
        speechRate: Float,
    ) {
        val locale = TtsScriptSegmenter.localeFor(segment.lang)
        val langResult = engine.setLanguage(locale)
        if (langResult == TextToSpeech.LANG_MISSING_DATA || langResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            StoryLog.w("TTS locale missing for $locale, falling back to ru-RU")
            engine.language = Locale("ru", "RU")
        }
        engine.setSpeechRate(if (segment.lang == TtsScriptSegmenter.Lang.EN) speechRate * 0.98f else speechRate)

        val utteranceId = "${UTTERANCE_ID}_$index"
        val params = Bundle().apply {
            putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
            putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
            putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC)
        }
        val queueMode = if (index == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
        val spokenText = if (segment.lang == TtsScriptSegmenter.Lang.RU) {
            RussianStress.apply(segment.text)
        } else {
            segment.text
        }
        val result = engine.speak(spokenText, queueMode, params, utteranceId)
        if (result == TextToSpeech.ERROR) {
            StoryLog.e("Android TTS speak returned ERROR for segment $index (${segment.lang})")
            _state.value = StoryPlaybackState.ERROR
            abandonAudioFocus()
            invokeError()
        } else {
            StoryLog.d("TTS segment $index ${segment.lang}: ${segment.text.take(40)}")
        }
    }

    private fun handleTtsError(
        engine: TextToSpeech,
        segments: List<TtsScriptSegmenter.Segment>,
        failedIndex: Int,
        speechRate: Float,
    ) {
        val failed = segments.getOrNull(failedIndex)
        if (failed?.lang == TtsScriptSegmenter.Lang.EN) {
            StoryLog.w("English TTS failed, retry segment as Russian")
            speakSegment(
                engine,
                TtsScriptSegmenter.Segment(failed.text, TtsScriptSegmenter.Lang.RU),
                failedIndex,
                speechRate,
            )
            return
        }
        if (!ttsPlainFallbackUsed) {
            ttsPlainFallbackUsed = true
            val script = pendingScript
            if (!script.isNullOrBlank()) {
                StoryLog.w("TTS segmented playback failed — retry whole script as Russian")
                playWithTtsPlainRussian(script, speechRate)
                return
            }
        }
        StoryLog.e("Android TTS speak error on segment $failedIndex")
        _state.value = StoryPlaybackState.ERROR
        abandonAudioFocus()
        invokeError()
    }

    private fun playWithTtsPlainRussian(script: String, speechRate: Float) {
        val engine = tts
        if (engine == null || !ttsReady) {
            _state.value = StoryPlaybackState.ERROR
            abandonAudioFocus()
            invokeError()
            return
        }
        _state.value = StoryPlaybackState.PREPARING
        scheduleTtsStartTimeout()
        engine.language = Locale("ru", "RU")
        engine.setSpeechRate(speechRate)
        val spoken = RussianStress.apply(script)
        engine.setOnUtteranceProgressListener(
            object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    mainHandler.post {
                        cancelTtsStartTimeout()
                        notifyPlaybackStarted()
                        _state.value = StoryPlaybackState.PLAYING
                    }
                }

                override fun onDone(utteranceId: String?) {
                    mainHandler.post {
                        cancelAllPlaybackTimeouts()
                        _state.value = StoryPlaybackState.COMPLETED
                        abandonAudioFocus()
                        invokeFinished()
                    }
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    mainHandler.post {
                        _state.value = StoryPlaybackState.ERROR
                        abandonAudioFocus()
                        invokeError()
                    }
                }

                override fun onError(utteranceId: String?, errorCode: Int) {
                    onError(utteranceId)
                }
            },
        )
        val params = Bundle().apply {
            putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "${UTTERANCE_ID}_plain")
            putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
            putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC)
        }
        val result = engine.speak(spoken, TextToSpeech.QUEUE_FLUSH, params, "${UTTERANCE_ID}_plain")
        if (result == TextToSpeech.ERROR) {
            _state.value = StoryPlaybackState.ERROR
            abandonAudioFocus()
            invokeError()
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
        cancelAllPlaybackTimeouts()
        exoPlayer.stop()
        exoPlayer.clearMediaItems()
        tts?.stop()
        abandonAudioFocus()
        _state.value = StoryPlaybackState.IDLE
        _currentScript.value = null
        pendingScript = null
        playbackStartedNotified = false
        ttsPlainFallbackUsed = false
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
        private const val EXO_START_TIMEOUT_MS = 28_000L
        private const val TTS_START_TIMEOUT_MS = 25_000L
    }
}
