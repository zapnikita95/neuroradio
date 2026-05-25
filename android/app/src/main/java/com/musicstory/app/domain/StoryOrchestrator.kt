package com.musicstory.app.domain

import android.content.Context
import android.os.SystemClock
import com.musicstory.app.R
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.data.repository.ScrobbleRepository
import com.musicstory.app.data.repository.StoryRepository
import com.musicstory.app.media.MediaControllerManager
import com.musicstory.app.service.MediaMonitorService
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicBoolean

enum class OrchestratorMode {
    AUTO,
    MANUAL,
}

enum class OrchestratorState {
    IDLE,
    LISTENING,
    FETCHING_STORY,
    PREPARING_PLAYBACK,
    PLAYING_STORY,
    ERROR,
}

data class OrchestratorUiState(
    val mode: OrchestratorMode = OrchestratorMode.AUTO,
    val state: OrchestratorState = OrchestratorState.IDLE,
    val currentTrack: TrackInfo? = null,
    val errorMessage: String? = null,
    val tracksUntilNext: Int? = null,
    val isServiceRunning: Boolean = false,
    val generationPreview: GenerationPreviewState = GenerationPreviewState(),
)

data class GenerationPreviewState(
    val words: List<String> = emptyList(),
    val visibleWordCount: Int = 0,
    val alpha: Float = 1f,
    val isActive: Boolean = false,
)

class StoryOrchestrator(
    private val context: Context,
    private val storyRepository: StoryRepository,
    private val scrobbleRepository: ScrobbleRepository,
    private val settingsDataStore: SettingsDataStore,
    private val mediaControllerManager: MediaControllerManager,
    private val storyPlayer: StoryPlayer,
    private val triggerEngine: TriggerEngine,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val storyMutex = Mutex()
    private var playbackSession = 0

    private val _mode = MutableStateFlow(OrchestratorMode.AUTO)
    val mode: StateFlow<OrchestratorMode> = _mode.asStateFlow()

    private val _state = MutableStateFlow(OrchestratorState.IDLE)
    val state: StateFlow<OrchestratorState> = _state.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _tracksUntilNext = MutableStateFlow<Int?>(null)
    val tracksUntilNext: StateFlow<Int?> = _tracksUntilNext.asStateFlow()

    private val _serviceRunning = MutableStateFlow(false)
    val serviceRunning: StateFlow<Boolean> = _serviceRunning.asStateFlow()

    private val _uiState = MutableStateFlow(OrchestratorUiState())
    val uiState: StateFlow<OrchestratorUiState> = _uiState.asStateFlow()

    private val _generationPreview = MutableStateFlow(GenerationPreviewState())
    private var previewJob: Job? = null

    private fun publishUiState() {
        if (_state.value != OrchestratorState.FETCHING_STORY &&
            _state.value != OrchestratorState.PREPARING_PLAYBACK
        ) {
            if (MonitorNotificationState.preparingStory.value) {
                MonitorNotificationState.setPreparing(false)
                MediaMonitorService.refreshNotification(context)
            }
        }
        _uiState.value = OrchestratorUiState(
            mode = _mode.value,
            state = _state.value,
            currentTrack = mediaControllerManager.effectiveNowPlaying.value,
            errorMessage = _errorMessage.value,
            tracksUntilNext = _tracksUntilNext.value,
            isServiceRunning = _serviceRunning.value,
            generationPreview = _generationPreview.value,
        )
    }

    init {
        scope.launch {
            settingsDataStore.manualMode.collect { manual ->
                _mode.value = if (manual) OrchestratorMode.MANUAL else OrchestratorMode.AUTO
                publishUiState()
            }
        }

        scope.launch {
            mediaControllerManager.nowPlaying.collect {
                publishUiState()
            }
        }

        scope.launch {
            storyPlayer.state.collect { playbackState ->
                if (playbackState == StoryPlaybackState.ERROR &&
                    (
                        _state.value == OrchestratorState.PREPARING_PLAYBACK ||
                            _state.value == OrchestratorState.PLAYING_STORY
                        )
                ) {
                    _errorMessage.value = "Не удалось воспроизвести историю"
                    _state.value = OrchestratorState.ERROR
                    publishUiState()
                }
            }
        }
    }

    fun setServiceRunning(running: Boolean) {
        _serviceRunning.value = running
        if (running && _state.value == OrchestratorState.IDLE) {
            _state.value = OrchestratorState.LISTENING
        }
        publishUiState()
        if (running) {
            checkOverdueAutoTrigger()
        }
    }

    /** Counter already at N (e.g. restored) but story never fired — trigger on current track. */
    private fun checkOverdueAutoTrigger() {
        scope.launch {
            if (_mode.value != OrchestratorMode.AUTO || isStorySessionActive()) return@launch
            val track = mediaControllerManager.effectiveNowPlaying.value ?: return@launch
            if (!track.isValid()) return@launch
            val settings = loadTriggerSettings()
            if (!settings.autoIntercept || settings.mode != TriggerMode.EVERY_N_TRACKS) return@launch
            triggerEngine.restoreTracksSinceLastStory(settingsDataStore.tracksSinceLastStory.first())
            _tracksUntilNext.value = triggerEngine.tracksUntilNext(settings)
            publishUiState()
            val firstTrackBonus = !settingsDataStore.firstAutoStoryCompleted.first()
            if (firstTrackBonus || triggerEngine.currentTracksSinceLastStory() >= settings.everyNTracks) {
                StoryLog.i("Auto story overdue — triggering for ${track.artist} — ${track.title}")
                playStoryForTrack(track, manual = false)
            }
        }
    }

    fun isStorySessionActive(): Boolean {
        return _state.value == OrchestratorState.FETCHING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK ||
            _state.value == OrchestratorState.PLAYING_STORY
    }

    suspend fun onTrackChanged(track: TrackInfo) {
        if (!track.isValid()) return

        triggerEngine.restoreTracksSinceLastStory(settingsDataStore.tracksSinceLastStory.first())

        val settings = loadTriggerSettings()
        val trackGenre = scrobbleRepository.lookupGenre(track.artist, track.title)
        val firstTrackBonus = !settingsDataStore.firstAutoStoryCompleted.first() &&
            settings.mode == TriggerMode.EVERY_N_TRACKS
        val shouldTrigger = _mode.value == OrchestratorMode.AUTO &&
            settings.autoIntercept &&
            !isStorySessionActive() &&
            triggerEngine.onTrackPlayed(
                settings = settings,
                trackKey = track.displayKey,
                trackArtist = track.artist,
                trackGenre = trackGenre,
                firstTrackBonus = firstTrackBonus,
            )

        settingsDataStore.setTracksSinceLastStory(triggerEngine.currentTracksSinceLastStory())
        _tracksUntilNext.value = triggerEngine.tracksUntilNext(settings)

        if (shouldTrigger) {
            StoryLog.i("Auto story trigger: ${track.artist} — ${track.title}")
            scrobbleRepository.markStoryTriggered(track)
            playStoryForTrack(track, manual = false)
        } else if (_state.value != OrchestratorState.PLAYING_STORY &&
            _state.value != OrchestratorState.PREPARING_PLAYBACK &&
            _state.value != OrchestratorState.FETCHING_STORY
        ) {
            _state.value = OrchestratorState.LISTENING
        }
        publishUiState()
    }

    fun requestManualStory() {
        val track = mediaControllerManager.effectiveNowPlaying.value
        if (track == null || !track.isValid()) {
            _errorMessage.value = "Нет активного трека для истории"
            _state.value = OrchestratorState.ERROR
            publishUiState()
            return
        }
        scope.launch {
            playStoryForTrack(track, manual = true)
        }
    }

    private suspend fun playStoryForTrack(requestedTrack: TrackInfo, manual: Boolean) {
        storyMutex.withLock {
            val session = ++playbackSession
            cancelGenerationPreview()
            _state.value = OrchestratorState.FETCHING_STORY
            _errorMessage.value = null
            publishUiState()

            val musicPausedForStory = AtomicBoolean(false)
            val interruptionMode = settingsDataStore.musicInterruptionMode.first()
            val fadeSeconds = settingsDataStore.musicFadeSeconds.first()

            fun resolveTrack(): TrackInfo? {
                val fresh = mediaControllerManager.resolveNowPlayingTrack()
                return fresh ?: requestedTrack.takeIf { it.isValid() }
            }

            var track = resolveTrack() ?: run {
                _errorMessage.value = "Нет активного трека для истории"
                _state.value = OrchestratorState.ERROR
                publishUiState()
                return@withLock
            }

            if (!manual) {
                val current = mediaControllerManager.resolveNowPlayingTrack()
                if (current != null && current.displayKey != track.displayKey) {
                    StoryLog.i("Track changed before fetch — using ${current.artist} — ${current.title}")
                    track = current
                }
            }

            val result = storyRepository.fetchStory(track, forceRefresh = manual)
            val ttsSpeed = settingsDataStore.ttsSpeed.first().androidRate
            result.fold(
                onSuccess = { response ->
                    if (session != playbackSession) return@fold

                    if (!manual) {
                        val current = mediaControllerManager.resolveNowPlayingTrack()
                        if (current != null && current.displayKey != track.displayKey) {
                            StoryLog.w("Track changed after fetch — skip stale story for ${track.artist}")
                            _state.value = OrchestratorState.LISTENING
                            publishUiState()
                            return@fold
                        }
                    }

                    if (manual) {
                        if (interruptionMode == MusicInterruptionMode.FADE) {
                            scope.launch {
                                mediaControllerManager.fadeOutAndPause(fadeSeconds)
                            }
                        } else {
                            mediaControllerManager.pauseMusic()
                        }
                        musicPausedForStory.set(true)
                        startGenerationPreview(response.script, session)
                    }

                    if (session != playbackSession) return@fold

                    _state.value = OrchestratorState.PREPARING_PLAYBACK
                    publishUiState()

                    val audioUrl = storyRepository.resolveAudioUrl(response.audioUrl)
                    storyPlayer.playStory(
                        response = response,
                        audioUrl = audioUrl,
                        speechRate = ttsSpeed,
                        resumeMusic = true,
                        onPlaybackStarted = {
                            if (session != playbackSession) return@playStory
                            scope.launch {
                                if (!manual) {
                                    withContext(Dispatchers.Main.immediate) {
                                        if (interruptionMode == MusicInterruptionMode.FADE) {
                                            mediaControllerManager.fadeOutAndPause(fadeSeconds)
                                        } else {
                                            mediaControllerManager.pauseMusic()
                                        }
                                    }
                                    musicPausedForStory.set(true)
                                    triggerEngine.onStoryPlaybackStarted()
                                    settingsDataStore.setTracksSinceLastStory(0)
                                    settingsDataStore.setFirstAutoStoryCompleted(true)
                                }
                            }
                            _state.value = OrchestratorState.PLAYING_STORY
                            publishUiState()
                        },
                        onFinished = {
                            if (session != playbackSession) return@playStory
                            cancelGenerationPreview()
                            if (musicPausedForStory.get() && storyPlayer.shouldResumeMusic()) {
                                mediaControllerManager.resumeMusic()
                            }
                            _errorMessage.value = null
                            _state.value = OrchestratorState.LISTENING
                            publishUiState()
                        },
                        onError = {
                            if (session != playbackSession) return@playStory
                            cancelGenerationPreview()
                            if (!manual) {
                                scope.launch {
                                    val everyN = settingsDataStore.everyNTracks.first()
                                    triggerEngine.rollbackFailedStoryTrigger(everyN)
                                    settingsDataStore.setTracksSinceLastStory(
                                        triggerEngine.currentTracksSinceLastStory(),
                                    )
                                }
                            }
                            _errorMessage.value = context.getString(R.string.server_audio_error_message)
                            _state.value = OrchestratorState.ERROR
                            if (musicPausedForStory.get()) {
                                mediaControllerManager.resumeMusic()
                            }
                            publishUiState()
                        },
                    )
                    scrobbleRepository.markStoryTriggered(track)
                    schedulePlaybackWatchdog(session, musicPausedForStory)
                },
                onFailure = { error ->
                    cancelGenerationPreview()
                    if (!manual) {
                        val everyN = settingsDataStore.everyNTracks.first()
                        triggerEngine.rollbackFailedStoryTrigger(everyN)
                        scope.launch {
                            settingsDataStore.setTracksSinceLastStory(
                                triggerEngine.currentTracksSinceLastStory(),
                            )
                        }
                    }
                    _errorMessage.value = error.message ?: "Не удалось получить историю"
                    _state.value = OrchestratorState.ERROR
                    publishUiState()
                },
            )
        }
    }

    private fun schedulePlaybackWatchdog(session: Int, musicPausedForStory: AtomicBoolean) {
        scope.launch {
            delay(PLAYBACK_START_TIMEOUT_MS)
            if (session != playbackSession) return@launch
            if (_state.value != OrchestratorState.PREPARING_PLAYBACK &&
                _state.value != OrchestratorState.PLAYING_STORY
            ) {
                return@launch
            }
            if (_state.value == OrchestratorState.PLAYING_STORY &&
                storyPlayer.state.value == StoryPlaybackState.PLAYING
            ) {
                return@launch
            }
            StoryLog.w("Playback watchdog: story did not start in time")
            storyPlayer.stop()
            cancelGenerationPreview()
            val everyN = settingsDataStore.everyNTracks.first()
            triggerEngine.rollbackFailedStoryTrigger(everyN)
            settingsDataStore.setTracksSinceLastStory(triggerEngine.currentTracksSinceLastStory())
            _errorMessage.value = context.getString(R.string.server_audio_error_message)
            _state.value = OrchestratorState.ERROR
            if (musicPausedForStory.get()) {
                mediaControllerManager.resumeMusic()
            }
            publishUiState()
        }
    }

    fun stopStory() {
        playbackSession++
        cancelGenerationPreview()
        storyPlayer.stop()
        mediaControllerManager.resumeMusic()
        _state.value = OrchestratorState.LISTENING
        publishUiState()
    }

    fun clearError() {
        clearTransientState()
    }

    fun onHomeHidden() {
        clearTransientState()
    }

    private fun clearTransientState() {
        cancelGenerationPreview()
        _errorMessage.value = null
        if (_state.value == OrchestratorState.ERROR ||
            _state.value == OrchestratorState.PLAYING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK
        ) {
            _state.value = OrchestratorState.LISTENING
        }
        publishUiState()
    }

    private suspend fun loadTriggerSettings(): TriggerSettings {
        return TriggerSettings(
            mode = settingsDataStore.triggerMode.first(),
            everyNTracks = settingsDataStore.everyNTracks.first(),
            sameTrackStoryEveryN = settingsDataStore.sameTrackStoryEveryN.first(),
            specificArtists = settingsDataStore.specificArtists.first(),
            specificGenres = settingsDataStore.specificGenres.first(),
            autoIntercept = settingsDataStore.autoIntercept.first(),
        )
    }

    private fun cancelGenerationPreview() {
        previewJob?.cancel()
        previewJob = null
        _generationPreview.value = GenerationPreviewState()
    }

    private fun startGenerationPreview(script: String, session: Int) {
        val words = script.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return

        previewJob?.cancel()
        previewJob = scope.launch {
            val revealMaxMs = PREVIEW_REVEAL_MAX_MS
            val holdMs = PREVIEW_HOLD_MS
            _generationPreview.value = GenerationPreviewState(
                words = words,
                visibleWordCount = 0,
                alpha = 1f,
                isActive = true,
            )
            publishUiState()

            val wordDelayMs = wordRevealDelayMs(words.size, revealMaxMs)
            for (index in 1..words.size) {
                if (session != playbackSession) return@launch
                _generationPreview.value = _generationPreview.value.copy(visibleWordCount = index)
                if (index == 1 || index == words.size || index % 2 == 0) {
                    publishUiState()
                }
                if (index < words.size) {
                    delay(wordDelayMs)
                }
            }
            delay(holdMs.coerceAtMost(1_100L))
            if (session != playbackSession) return@launch
            _generationPreview.value = _generationPreview.value.copy(alpha = 1f, isActive = true)
            publishUiState()
        }
    }

    private fun wordRevealDelayMs(wordCount: Int, revealMaxMs: Long = PREVIEW_REVEAL_MAX_MS): Long {
        if (wordCount <= 1) return 0L
        return (revealMaxMs / wordCount).coerceIn(40L, 160L)
    }

    companion object {
        private const val PLAYBACK_START_TIMEOUT_MS = 25_000L
        private const val PREVIEW_REVEAL_MAX_MS = 7_000L
        private const val PREVIEW_HOLD_MS = 7_000L
    }
}

