package com.musicstory.app.domain

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import androidx.media3.common.AudioAttributes as MediaAudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.Locale

enum class StoryPlaybackState {
    IDLE,
    PREPARING,
    PLAYING,
    PAUSED,
    COMPLETED,
    ERROR,
}

/**
 * Playback: Yandex server audio (ExoPlayer) or Android TextToSpeech (test toggle in settings).
 */
class StoryPlayer(context: Context) {

    private val appContext = context.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var audioFocusRequest: AudioFocusRequest? = null
    private val httpDataSourceFactory = DefaultHttpDataSource.Factory()
        .setUserAgent("MusicStory/${com.musicstory.app.BuildConfig.VERSION_NAME} (Android)")
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(30_000)
        .setReadTimeoutMs(90_000)
    private val exoPlayer: ExoPlayer = ExoPlayer.Builder(appContext)
        .setMediaSourceFactory(DefaultMediaSourceFactory(httpDataSourceFactory))
        .setAudioAttributes(
            MediaAudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build(),
            true,
        )
        .build()

    private var textToSpeech: TextToSpeech? = null
    private var androidTtsReady = false
    private var androidTtsInitStarted = false
    private var activePlaybackEngine = TtsPlaybackEngine.YANDEX_SERVER
    private var lastAndroidSpeechRate = 1.0f
    private var lastAndroidScript: String? = null

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
                    } else if (exoPlayer.playbackState == Player.STATE_READY) {
                        _state.value = StoryPlaybackState.PAUSED
                        stopProgressPolling()
                    } else {
                        stopProgressPolling()
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    StoryLog.e("ExoPlayer error (Yandex server audio): ${error.message}", error)
                    if (retryExoSameUrl("player error")) return
                    failPlayback()
                }
            },
        )
    }

    fun playStory(
        response: StoryResponse,
        audioUrl: String?,
        speechRate: Float = 0.92f,
        playbackEngine: TtsPlaybackEngine = TtsPlaybackEngine.YANDEX_SERVER,
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
        activePlaybackEngine = playbackEngine
        lastAndroidSpeechRate = speechRate
        _currentScript.value = response.script

        if (!requestAudioFocus()) {
            StoryLog.w("Audio focus not granted — trying playback anyway")
        }

        when (playbackEngine) {
            TtsPlaybackEngine.ANDROID_DEVICE -> playWithAndroidTts(response.script, speechRate)
            TtsPlaybackEngine.YANDEX_SERVER -> {
                if (audioUrl.isNullOrBlank()) {
                    StoryLog.e("No server audioUrl — switch to Android TTS in settings or check Yandex on Railway")
                    _state.value = StoryPlaybackState.ERROR
                    invokeError()
                    return
                }
                StoryLog.i("Playing Yandex server audio: $audioUrl")
                playWithExoPlayer(audioUrl)
            }
        }
    }

    private fun playWithAndroidTts(script: String, speechRate: Float) {
        val plainText = sanitizeScriptForAndroidTts(script)
        if (plainText.isBlank()) {
            StoryLog.e("Android TTS: empty script after sanitize")
            failPlayback()
            return
        }
        lastAndroidScript = plainText
        _state.value = StoryPlaybackState.PREPARING
        scheduleAndroidStartTimeout()
        ensureAndroidTts(
            onReady = {
                val tts = textToSpeech ?: run {
                    failPlayback()
                    return@ensureAndroidTts
                }
                tts.setSpeechRate(speechRate.coerceIn(0.5f, 2.0f))
                tts.setOnUtteranceProgressListener(androidUtteranceListener)
                val result = tts.speak(plainText, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID)
                if (result == TextToSpeech.ERROR) {
                    StoryLog.e("Android TTS speak() returned ERROR")
                    failPlayback()
                }
            },
            onError = {
                StoryLog.e("Android TTS init failed — install Russian voice in system settings")
                failPlayback()
            },
        )
    }

    private val androidUtteranceListener = object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {
            mainHandler.post {
                cancelPlaybackTimeout()
                notifyPlaybackStarted()
                _state.value = StoryPlaybackState.PLAYING
                _playbackProgress.value = 0f
            }
        }

        override fun onDone(utteranceId: String?) {
            mainHandler.post {
                cancelPlaybackTimeout()
                _playbackProgress.value = 1f
                _state.value = StoryPlaybackState.COMPLETED
                abandonAudioFocus()
                invokeFinished()
            }
        }

        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) {
            mainHandler.post { failPlayback() }
        }

        override fun onError(utteranceId: String?, errorCode: Int) {
            mainHandler.post {
                StoryLog.e("Android TTS utterance error code=$errorCode")
                failPlayback()
            }
        }
    }

    private fun ensureAndroidTts(onReady: () -> Unit, onError: () -> Unit) {
        if (androidTtsReady && textToSpeech != null) {
            onReady()
            return
        }
        if (androidTtsInitStarted && textToSpeech != null) {
            pendingAndroidReady = onReady
            pendingAndroidError = onError
            return
        }
        androidTtsInitStarted = true
        pendingAndroidReady = onReady
        pendingAndroidError = onError
        textToSpeech = TextToSpeech(appContext) { status ->
            mainHandler.post {
                if (status != TextToSpeech.SUCCESS) {
                    StoryLog.e("Android TTS init status=$status")
                    androidTtsInitStarted = false
                    pendingAndroidError?.invoke()
                    clearPendingAndroidCallbacks()
                    return@post
                }
                val tts = textToSpeech ?: run {
                    pendingAndroidError?.invoke()
                    clearPendingAndroidCallbacks()
                    return@post
                }
                val locale = Locale.forLanguageTag("ru-RU")
                val langResult = tts.setLanguage(locale)
                if (langResult == TextToSpeech.LANG_MISSING_DATA ||
                    langResult == TextToSpeech.LANG_NOT_SUPPORTED
                ) {
                    StoryLog.e("Android TTS: Russian language not supported (langResult=$langResult)")
                    pendingAndroidError?.invoke()
                    clearPendingAndroidCallbacks()
                    return@post
                }
                selectRussianVoice(tts)
                androidTtsReady = true
                StoryLog.i("Android TTS ready, voice=${tts.voice?.name ?: "default"}")
                pendingAndroidReady?.invoke()
                clearPendingAndroidCallbacks()
            }
        }
    }

    private var pendingAndroidReady: (() -> Unit)? = null
    private var pendingAndroidError: (() -> Unit)? = null

    private fun clearPendingAndroidCallbacks() {
        pendingAndroidReady = null
        pendingAndroidError = null
    }

    private fun selectRussianVoice(tts: TextToSpeech) {
        val voices = tts.voices.orEmpty()
        val ruVoice = voices
            .filter { voice ->
                voice.locale.language.equals("ru", ignoreCase = true) && !voice.isNetworkConnectionRequired
            }
            .maxByOrNull { voice ->
                var score = 0
                if (voice.quality >= Voice.QUALITY_HIGH) score += 4
                if (!voice.isNetworkConnectionRequired) score += 2
                score
            }
        if (ruVoice != null) {
            tts.voice = ruVoice
            StoryLog.i("Android TTS voice selected: ${ruVoice.name}")
        }
    }

    private fun sanitizeScriptForAndroidTts(script: String): String {
        return script
            .replace(Regex("\\+(?=[А-ЯЁа-яё])"), "")
            .replace(Regex("<\\[(?:small|medium|large)\\]>"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun retryExoSameUrl(reason: String): Boolean {
        if (playbackStartedNotified || exoPlayer.currentPosition > 1_500L) {
            StoryLog.w(
                "ExoPlayer $reason after playback started (pos=${exoPlayer.currentPosition}ms) — no restart",
            )
            return false
        }
        if (exoRetryCount >= MAX_EXO_URL_RETRIES) return false
        val retryUrl = currentExoUrl
        if (retryUrl.isNullOrBlank()) return false
        exoRetryCount++
        StoryLog.w("ExoPlayer $reason — retry $exoRetryCount/$MAX_EXO_URL_RETRIES before first audio")
        exoPlayer.stop()
        exoPlayer.clearMediaItems()
        playbackStartedNotified = false
        playWithExoPlayer(retryUrl)
        return true
    }

    private fun playWithExoPlayer(url: String) {
        currentExoUrl = url
        _state.value = StoryPlaybackState.PREPARING
        scheduleExoBufferingTimeout()
        val mimeType = when {
            url.contains(".wav", ignoreCase = true) -> MimeTypes.AUDIO_WAV
            url.contains(".ogg", ignoreCase = true) -> MimeTypes.AUDIO_OGG
            else -> null
        }
        val mediaItemBuilder = MediaItem.Builder().setUri(url)
        if (mimeType != null) {
            mediaItemBuilder.setMimeType(mimeType)
        }
        exoPlayer.setMediaItem(mediaItemBuilder.build())
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
    }

    private fun scheduleAndroidStartTimeout() {
        cancelPlaybackTimeout()
        playbackTimeoutRunnable = Runnable {
            if (_state.value != StoryPlaybackState.PREPARING &&
                _state.value != StoryPlaybackState.PLAYING
            ) {
                return@Runnable
            }
            if (textToSpeech?.isSpeaking == true) return@Runnable
            StoryLog.e("Android TTS start timeout")
            failPlayback()
        }
        mainHandler.postDelayed(playbackTimeoutRunnable!!, ANDROID_START_TIMEOUT_MS)
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
            if (retryExoSameUrl("start timeout")) return@Runnable
            StoryLog.e("ExoPlayer start timeout after retries (Yandex server audio)")
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
        if (activePlaybackEngine != TtsPlaybackEngine.YANDEX_SERVER) return
        stopProgressPolling()
        progressPollRunnable = object : Runnable {
            override fun run() {
                val duration = exoPlayer.duration
                if (duration > 0L) {
                    _playbackProgress.value =
                        (exoPlayer.currentPosition.toFloat() / duration).coerceIn(0f, 1f)
                }
                val playing = exoPlayer.isPlaying
                val buffering = exoPlayer.playbackState == Player.STATE_BUFFERING
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
        exoPlayer.stop()
        exoPlayer.clearMediaItems()
        textToSpeech?.stop()
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
        when (activePlaybackEngine) {
            TtsPlaybackEngine.ANDROID_DEVICE -> {
                textToSpeech?.stop()
                _state.value = StoryPlaybackState.PAUSED
            }
            TtsPlaybackEngine.YANDEX_SERVER -> {
                if (exoPlayer.isPlaying) {
                    exoPlayer.pause()
                    _state.value = StoryPlaybackState.PAUSED
                }
            }
        }
    }

    fun resume() {
        when (activePlaybackEngine) {
            TtsPlaybackEngine.ANDROID_DEVICE -> {
                val script = lastAndroidScript
                if (!script.isNullOrBlank() && androidTtsReady) {
                    playWithAndroidTts(script, lastAndroidSpeechRate)
                }
            }
            TtsPlaybackEngine.YANDEX_SERVER -> {
                if (exoPlayer.mediaItemCount > 0) {
                    exoPlayer.play()
                }
            }
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
        lastAndroidScript = null
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
        textToSpeech?.shutdown()
        textToSpeech = null
        androidTtsReady = false
        androidTtsInitStarted = false
    }

    companion object {
        private const val EXO_START_TIMEOUT_MS = 45_000L
        /** One retry only if audio never started — avoids triple restart mid-playback. */
        private const val MAX_EXO_URL_RETRIES = 1
        private const val ANDROID_START_TIMEOUT_MS = 12_000L
        private const val UTTERANCE_ID = "music_story_script"
    }
}
