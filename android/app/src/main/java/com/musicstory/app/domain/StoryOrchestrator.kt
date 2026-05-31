package com.musicstory.app.domain

import android.content.Context
import android.widget.Toast
import com.musicstory.app.R
import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.data.repository.ScrobbleRepository
import com.musicstory.app.data.repository.StoryRepository
import com.musicstory.app.media.MediaControllerManager
import com.musicstory.app.service.MediaMonitorService
import com.musicstory.app.util.StoryLog
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
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
    val hintMessage: String? = null,
    val tracksUntilNext: Int? = null,
    val isServiceRunning: Boolean = false,
    val generationPreview: GenerationPreviewState = GenerationPreviewState(),
    /** Запрос на сервер или озвучка — показываем «Отменить». */
    val isGenerationActive: Boolean = false,
    /** POST /v1/story/full in flight — «Готовим историю…». */
    val isBackendFetching: Boolean = false,
    /** Manual «Рассказать историю» allowed (cooldown gate). */
    val canRequestManualStory: Boolean = true,
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
    private var activeStoryJob: Job? = null
    private var inFlightTrackKey: String? = null
    /** When playback of the last story actually started (for notification cooldown). */
    private var lastStoryStartedAtMs: Long = 0L
    private var cooldownRefreshJob: Job? = null
    /** True while a story job is running (fetch + playback prep). */
    private var generationInFlight = false
    /** True only while POST /v1/story/full is in flight. */
    private var backendFetchInFlight = false
    private var manualStoryGateAllowed = true

    private val _mode = MutableStateFlow(OrchestratorMode.AUTO)
    val mode: StateFlow<OrchestratorMode> = _mode.asStateFlow()

    private val _state = MutableStateFlow(OrchestratorState.IDLE)
    val state: StateFlow<OrchestratorState> = _state.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _hintMessage = MutableStateFlow<String?>(null)
    val hintMessage: StateFlow<String?> = _hintMessage.asStateFlow()

    private val _tracksUntilNext = MutableStateFlow<Int?>(null)
    val tracksUntilNext: StateFlow<Int?> = _tracksUntilNext.asStateFlow()

    private val _serviceRunning = MutableStateFlow(false)
    val serviceRunning: StateFlow<Boolean> = _serviceRunning.asStateFlow()

    private val _uiState = MutableStateFlow(OrchestratorUiState())
    val uiState: StateFlow<OrchestratorUiState> = _uiState.asStateFlow()

    private val _generationPreview = MutableStateFlow(GenerationPreviewState())
    private var previewJob: Job? = null

    private fun publishUiState() {
        if (_state.value == OrchestratorState.FETCHING_STORY &&
            !backendFetchInFlight &&
            !generationInFlight &&
            activeStoryJob?.isActive != true
        ) {
            StoryLog.w("Stale FETCHING state — reset to LISTENING")
            _state.value = OrchestratorState.LISTENING
        }
        val generationActive = generationInFlight ||
            activeStoryJob?.isActive == true ||
            backendFetchInFlight ||
            _state.value == OrchestratorState.FETCHING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK ||
            _state.value == OrchestratorState.PLAYING_STORY
        if (!backendFetchInFlight &&
            !generationActive &&
            _state.value != OrchestratorState.FETCHING_STORY &&
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
            hintMessage = _hintMessage.value,
            tracksUntilNext = _tracksUntilNext.value,
            isServiceRunning = _serviceRunning.value,
            generationPreview = _generationPreview.value,
            isGenerationActive = generationActive,
            isBackendFetching = backendFetchInFlight,
            canRequestManualStory = manualStoryGateAllowed,
        )
        refreshManualStoryNotificationGate(generationActive)
    }

    private fun refreshManualStoryNotificationGate(isGenerationActive: Boolean) {
        scope.launch {
            val track = mediaControllerManager.effectiveNowPlaying.value
            val hasTrack = track?.isValid() == true
            val hasApiKey = storyRepository.hasOwnApiKeyConfigured()
            val preparing = MonitorNotificationState.preparingStory.value
            val gate = ManualStoryGate.evaluate(
                lastStoryStartedAtMs = lastStoryStartedAtMs,
                hasValidTrack = hasTrack,
                hasApiKey = hasApiKey,
                isGenerationActive = isGenerationActive,
                isBackendFetching = backendFetchInFlight,
                preparingFromNotification = preparing,
            )
            manualStoryGateAllowed = gate.allowed
            MonitorNotificationState.setManualStoryUi(gate.showAction, gate.userMessage)
            _uiState.value = _uiState.value.copy(
                canRequestManualStory = gate.allowed,
                isBackendFetching = backendFetchInFlight,
            )
            if (gate.retryInMs > 0L) {
                scheduleCooldownNotificationRefresh(gate.retryInMs)
            } else {
                MediaMonitorService.refreshNotification(context)
            }
        }
    }

    private fun scheduleCooldownNotificationRefresh(delayMs: Long) {
        cooldownRefreshJob?.cancel()
        cooldownRefreshJob = scope.launch {
            delay(delayMs + 100L)
            val generationActive = generationInFlight ||
                activeStoryJob?.isActive == true ||
                _state.value == OrchestratorState.FETCHING_STORY ||
                _state.value == OrchestratorState.PREPARING_PLAYBACK ||
                _state.value == OrchestratorState.PLAYING_STORY
            refreshManualStoryNotificationGate(generationActive)
            MediaMonitorService.refreshNotification(context)
        }
    }

    private suspend fun evaluateManualStoryGate(): ManualStoryGate.Result {
        val track = mediaControllerManager.effectiveNowPlaying.value
        val generationActive = generationInFlight ||
            activeStoryJob?.isActive == true ||
            _state.value == OrchestratorState.FETCHING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK ||
            _state.value == OrchestratorState.PLAYING_STORY
        return ManualStoryGate.evaluate(
            lastStoryStartedAtMs = lastStoryStartedAtMs,
            hasValidTrack = track?.isValid() == true,
            hasApiKey = storyRepository.hasOwnApiKeyConfigured(),
            isGenerationActive = generationActive,
            isBackendFetching = backendFetchInFlight,
            preparingFromNotification = MonitorNotificationState.preparingStory.value,
        )
    }

    private fun showManualStoryBlocked(message: String, fromNotification: Boolean) {
        if (fromNotification) {
            Toast.makeText(context.applicationContext, message, Toast.LENGTH_SHORT).show()
            MediaMonitorService.refreshNotification(context)
        } else {
            _hintMessage.value = message
            publishUiState()
        }
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
                    _hintMessage.value = null
                    _state.value = OrchestratorState.ERROR
                    publishUiState()
                }
            }
        }

        scope.launch {
            while (true) {
                delay(5_000)
                reconcileGenerationState()
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
        reconcileGenerationState()
    }

    /** UI must not stay «Готовим историю» if the coroutine already died. */
    private fun reconcileGenerationState() {
        val jobDead = activeStoryJob?.isActive != true
        if ((generationInFlight || backendFetchInFlight || _state.value == OrchestratorState.FETCHING_STORY) && jobDead) {
            StoryLog.w("Generation stale — clearing (no active job, state=${_state.value})")
            generationInFlight = false
            backendFetchInFlight = false
            if (_state.value == OrchestratorState.FETCHING_STORY ||
                _state.value == OrchestratorState.PREPARING_PLAYBACK
            ) {
                _state.value = OrchestratorState.LISTENING
            }
            if (MonitorNotificationState.preparingStory.value) {
                MonitorNotificationState.setPreparing(false)
                MediaMonitorService.refreshNotification(context)
            }
            publishUiState()
        }
    }

    /** Counter already at N (e.g. restored) but story never fired — trigger on current track. */
    private fun checkOverdueAutoTrigger() {
        scope.launch {
            if (_mode.value != OrchestratorMode.AUTO || isStorySessionActive()) return@launch
            if (!storyRepository.hasOwnApiKeyConfigured()) return@launch
            val track = mediaControllerManager.effectiveNowPlaying.value ?: return@launch
            if (!track.isValid()) return@launch
            val settings = loadTriggerSettings()
            if (!settings.autoIntercept || settings.mode != TriggerMode.EVERY_N_TRACKS) return@launch
            triggerEngine.restoreTracksSinceLastStory(settingsDataStore.tracksSinceLastStory.first())
            _tracksUntilNext.value = triggerEngine.tracksUntilNext(settings)
            publishUiState()
            val counter = triggerEngine.currentTracksSinceLastStory()
            val firstPending = !settingsDataStore.firstAutoStoryCompleted.first() && counter == 0
            if (counter >= settings.everyNTracks || firstPending) {
                StoryLog.i("Auto story overdue — triggering for ${track.artist} — ${track.title}")
                _tracksUntilNext.value = null
                playStoryForTrack(track, manual = false)
            }
        }
    }

    fun isStorySessionActive(): Boolean {
        return generationInFlight ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK ||
            _state.value == OrchestratorState.PLAYING_STORY
    }

    suspend fun onTrackChanged(track: TrackInfo) {
        if (!track.isValid()) return

        _hintMessage.value = null

        cancelStaleGenerationForNewTrack(track, reason = "track changed")

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
            _tracksUntilNext.value = null
            playStoryForTrack(track, manual = false)
        } else if (_state.value != OrchestratorState.PLAYING_STORY &&
            _state.value != OrchestratorState.PREPARING_PLAYBACK &&
            !generationInFlight
        ) {
            _state.value = OrchestratorState.LISTENING
        }
        publishUiState()
    }

    fun requestManualStory(fromNotification: Boolean = false) {
        scope.launch {
            val gate = evaluateManualStoryGate()
            if (!gate.allowed) {
                gate.userMessage?.let { showManualStoryBlocked(it, fromNotification) }
                return@launch
            }
            val track = mediaControllerManager.effectiveNowPlaying.value
            if (track == null || !track.isValid()) {
                showNoTrackHint()
                return@launch
            }
            StoryLog.i("Manual story requested: ${track.artist} — ${track.title}")
            backendFetchInFlight = true
            MonitorNotificationState.setPreparing(true)
            _state.value = OrchestratorState.FETCHING_STORY
            publishUiState()
            MediaMonitorService.refreshNotification(context)
            playStoryForTrack(track, manual = true)
        }
    }

    private fun showNoTrackHint() {
        _errorMessage.value = null
        _hintMessage.value = context.getString(R.string.hint_no_track_for_story)
        _state.value = OrchestratorState.LISTENING
        publishUiState()
    }

    private fun playStoryForTrack(requestedTrack: TrackInfo, manual: Boolean) {
        cancelInFlightGenerationImmediate("superseded")
        generationInFlight = true
        _errorMessage.value = null
        _hintMessage.value = null
        if (_state.value != OrchestratorState.PLAYING_STORY &&
            _state.value != OrchestratorState.PREPARING_PLAYBACK
        ) {
            _state.value = OrchestratorState.LISTENING
        }
        publishUiState()

        activeStoryJob = scope.launch {
            if (!storyRepository.hasOwnApiKeyConfigured()) {
                StoryLog.i("Story blocked: API key not configured")
                backendFetchInFlight = false
                MonitorNotificationState.setPreparing(false)
                handleStoryBlockedNoApiKey(manual)
                generationInFlight = false
                if (manual) {
                    MonitorNotificationState.setPreparing(false)
                    MediaMonitorService.refreshNotification(context)
                }
                return@launch
            }

            val session = ++playbackSession
            inFlightTrackKey = requestedTrack.displayKey
            cancelGenerationPreview()
            _tracksUntilNext.value = null
            publishUiState()

            try {
                executeStoryPipeline(session, requestedTrack, manual)
            } catch (e: CancellationException) {
                if (e is TimeoutCancellationException) {
                    StoryLog.e("Story pipeline timeout", e)
                    val isLocal = settingsDataStore.llmProvider.first() == LlmProvider.LOCAL
                    _errorMessage.value = if (isLocal) {
                        "Слишком долго ждём локальную модель (до 20 мин). Смотри логи: Music story\\logs\\local-bff.log"
                    } else {
                        "Слишком долго ждём ответ сервера. Проверь интернет и backend."
                    }
                    _state.value = OrchestratorState.ERROR
                    publishUiState()
                } else {
                    StoryLog.i("Story pipeline cancelled: ${e.message}")
                }
            } catch (e: Exception) {
                StoryLog.e("Story pipeline failed: ${e.message}", e)
                abortGeneration(session, manual, rollbackAutoTrigger = !manual)
                _errorMessage.value = e.message ?: "Не удалось получить историю"
                _state.value = OrchestratorState.ERROR
                publishUiState()
            } finally {
                generationInFlight = false
                inFlightTrackKey = null
                if (_state.value == OrchestratorState.FETCHING_STORY) {
                    if (isSessionCurrent(session)) {
                        abortGeneration(session, manual, rollbackAutoTrigger = !manual)
                    } else {
                        _state.value = OrchestratorState.LISTENING
                        publishUiState()
                    }
                }
                reconcileGenerationState()
            }
        }
    }

    private suspend fun handleStoryBlockedNoApiKey(manual: Boolean) {
        if (manual) {
            _errorMessage.value = null
            _hintMessage.value = context.getString(R.string.hint_api_key_required)
        } else {
            val everyN = settingsDataStore.everyNTracks.first()
            triggerEngine.rollbackFailedStoryTrigger(everyN)
            settingsDataStore.setTracksSinceLastStory(triggerEngine.currentTracksSinceLastStory())
        }
        _state.value = OrchestratorState.LISTENING
        refreshTracksUntilNext()
        publishUiState()
    }

    /** Generation aborted (track changed, stale result, timeout) — return to listening. */
    private suspend fun abortGeneration(
        session: Int,
        manual: Boolean,
        rollbackAutoTrigger: Boolean,
    ) {
        if (!isSessionCurrent(session)) {
            if (_state.value == OrchestratorState.FETCHING_STORY) {
                _state.value = OrchestratorState.LISTENING
                publishUiState()
            }
            return
        }
        cancelGenerationPreview()
        if (rollbackAutoTrigger && !manual) {
            val everyN = settingsDataStore.everyNTracks.first()
            triggerEngine.rollbackFailedStoryTrigger(everyN)
            settingsDataStore.setTracksSinceLastStory(triggerEngine.currentTracksSinceLastStory())
        }
        _state.value = OrchestratorState.LISTENING
        refreshTracksUntilNext()
        publishUiState()
    }

    private suspend fun refreshTracksUntilNext() {
        if (_mode.value != OrchestratorMode.AUTO) {
            _tracksUntilNext.value = null
            return
        }
        triggerEngine.restoreTracksSinceLastStory(settingsDataStore.tracksSinceLastStory.first())
        _tracksUntilNext.value = triggerEngine.tracksUntilNext(loadTriggerSettings())
    }

    private suspend fun executeStoryPipeline(
        session: Int,
        requestedTrack: TrackInfo,
        manual: Boolean,
    ) {
        if (!isSessionCurrent(session)) return

        val musicPausedForStory = AtomicBoolean(false)
        val interruptionMode = settingsDataStore.musicInterruptionMode.first()
        val fadeSeconds = settingsDataStore.musicFadeSeconds.first()

        var track = resolveTrackForGeneration(requestedTrack) ?: run {
            if (manual) {
                showNoTrackHint()
            } else {
                _state.value = OrchestratorState.LISTENING
                publishUiState()
            }
            return
        }

        if (!manual && !isTrackStillCurrent(session, track)) {
            StoryLog.i("Track changed before fetch — abort ${track.artist}")
            abortGeneration(session, manual, rollbackAutoTrigger = true)
            return
        }

        if (!backendFetchInFlight) {
            backendFetchInFlight = true
            MonitorNotificationState.setPreparing(true)
            _state.value = OrchestratorState.FETCHING_STORY
            publishUiState()
        }

        val fetchTimeoutMs = if (settingsDataStore.llmProvider.first() == LlmProvider.LOCAL) {
            LOCAL_STORY_FETCH_TIMEOUT_MS
        } else {
            STORY_FETCH_TIMEOUT_MS
        }
        val result = try {
            withTimeout(fetchTimeoutMs) {
                storyRepository.fetchStory(track, forceRefresh = true)
            }
        } finally {
            backendFetchInFlight = false
            MonitorNotificationState.setPreparing(false)
            MediaMonitorService.refreshNotification(context)
        }
        if (!isSessionCurrent(session) || !isTrackStillCurrent(session, track)) {
            StoryLog.i("Track changed during fetch — discard ${track.artist}")
            abortGeneration(session, manual, rollbackAutoTrigger = true)
            return
        }

        val ttsSpeed = settingsDataStore.ttsSpeed.first().androidRate
        result.fold(
            onSuccess = { response ->
                if (!isSessionCurrent(session) || !isTrackStillCurrent(session, track)) {
                    StoryLog.w("Track changed after fetch — skip stale story for ${track.artist}")
                    abortGeneration(session, manual, rollbackAutoTrigger = !manual)
                    return@fold
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

                if (!isSessionCurrent(session)) return@fold

                storyMutex.withLock {
                    if (!isSessionCurrent(session) || !isTrackStillCurrent(session, track)) return@withLock

                    _state.value = OrchestratorState.PREPARING_PLAYBACK
                    publishUiState()

                    val audioUrl = storyRepository.resolveAudioUrl(response.audioUrl)
                    storyPlayer.playStory(
                        response = response,
                        audioUrl = audioUrl,
                        speechRate = ttsSpeed,
                        resumeMusic = true,
                        onPlaybackStarted = {
                            if (!isSessionCurrent(session)) return@playStory
                            lastStoryStartedAtMs = System.currentTimeMillis()
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
                                    refreshTracksUntilNext()
                                }
                            }
                            _state.value = OrchestratorState.PLAYING_STORY
                            publishUiState()
                        },
                        onFinished = {
                            if (!isSessionCurrent(session)) return@playStory
                            cancelGenerationPreview()
                            if (musicPausedForStory.get() && storyPlayer.shouldResumeMusic()) {
                                mediaControllerManager.resumeMusic()
                            }
                            _errorMessage.value = null
                            _state.value = OrchestratorState.LISTENING
                            scope.launch { refreshTracksUntilNext() }
                            publishUiState()
                        },
                        onError = {
                            if (!isSessionCurrent(session)) return@playStory
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
                            _hintMessage.value = null
                            _state.value = OrchestratorState.ERROR
                            if (musicPausedForStory.get()) {
                                mediaControllerManager.resumeMusic()
                            }
                            publishUiState()
                        },
                    )
                    scrobbleRepository.markStoryTriggered(track)
                    schedulePlaybackWatchdog(session, musicPausedForStory)
                }
            },
            onFailure = { error ->
                if (error is CancellationException) return@fold
                cancelGenerationPreview()
                if (!manual) {
                    val everyN = settingsDataStore.everyNTracks.first()
                    triggerEngine.rollbackFailedStoryTrigger(everyN)
                    settingsDataStore.setTracksSinceLastStory(
                        triggerEngine.currentTracksSinceLastStory(),
                    )
                }
                _errorMessage.value = error.message ?: "Не удалось получить историю"
                _hintMessage.value = null
                _state.value = OrchestratorState.ERROR
                publishUiState()
            },
        )
    }

    private suspend fun cancelStaleGenerationForNewTrack(track: TrackInfo, reason: String) {
        val inFlight = inFlightTrackKey
        val generating = activeStoryJob?.isActive == true || generationInFlight ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK
        if (!generating) return
        if (inFlight != null && inFlight == track.displayKey) return
        cancelInFlightGeneration(reason, rollbackAutoTrigger = true)
    }

    private fun cancelInFlightGenerationImmediate(reason: String) {
        val wasActive = generationInFlight ||
            _state.value == OrchestratorState.FETCHING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK
        playbackSession++
        generationInFlight = false
        backendFetchInFlight = false
        activeStoryJob?.cancel(CancellationException(reason))
        activeStoryJob = null
        inFlightTrackKey = null
        cancelGenerationPreview()
        if (MonitorNotificationState.preparingStory.value) {
            MonitorNotificationState.setPreparing(false)
            MediaMonitorService.refreshNotification(context)
        }
        if (wasActive) {
            _state.value = OrchestratorState.LISTENING
        }
        StoryLog.i("Story generation cancelled: $reason")
        publishUiState()
    }

    private suspend fun cancelInFlightGeneration(reason: String, rollbackAutoTrigger: Boolean) {
        val wasActive = generationInFlight ||
            _state.value == OrchestratorState.FETCHING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK
        playbackSession++
        generationInFlight = false
        backendFetchInFlight = false
        activeStoryJob?.cancel(CancellationException(reason))
        activeStoryJob = null
        inFlightTrackKey = null
        cancelGenerationPreview()
        if (MonitorNotificationState.preparingStory.value) {
            MonitorNotificationState.setPreparing(false)
            MediaMonitorService.refreshNotification(context)
        }
        if (wasActive) {
            _state.value = OrchestratorState.LISTENING
            if (rollbackAutoTrigger) {
                val everyN = settingsDataStore.everyNTracks.first()
                triggerEngine.rollbackFailedStoryTrigger(everyN)
                settingsDataStore.setTracksSinceLastStory(
                    triggerEngine.currentTracksSinceLastStory(),
                )
            }
            refreshTracksUntilNext()
        }
        StoryLog.i("Story generation cancelled: $reason")
        publishUiState()
    }

    private fun resolveTrackForGeneration(requestedTrack: TrackInfo): TrackInfo? {
        val fresh = mediaControllerManager.resolveNowPlayingTrack()
        return fresh ?: requestedTrack.takeIf { it.isValid() }
    }

    private fun isSessionCurrent(session: Int): Boolean = session == playbackSession

    private fun isTrackStillCurrent(session: Int, track: TrackInfo): Boolean {
        if (!isSessionCurrent(session)) return false
        val current = mediaControllerManager.resolveNowPlayingTrack() ?: return true
        return current.displayKey == track.displayKey
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
            _hintMessage.value = null
            _state.value = OrchestratorState.ERROR
            if (musicPausedForStory.get()) {
                mediaControllerManager.resumeMusic()
            }
            publishUiState()
        }
    }

    /** Сброс залипшего «Готовим историю» при открытии главного экрана. */
    fun recoverStaleUi() {
        reconcileGenerationState()
        publishUiState()
    }

    fun cancelGeneration() {
        stopStory()
    }

    fun stopStory() {
        cancelInFlightGenerationImmediate("stopped by user")
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
        _hintMessage.value = null
        if (_state.value == OrchestratorState.ERROR ||
            _state.value == OrchestratorState.FETCHING_STORY ||
            _state.value == OrchestratorState.PLAYING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK
        ) {
            _state.value = OrchestratorState.LISTENING
            scope.launch { refreshTracksUntilNext() }
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
        /** Metadata + backend /v1/story/full — must not leave UI stuck in FETCHING. */
        private const val STORY_FETCH_TIMEOUT_MS = 90_000L
        /** Local Ollama on PC BFF — 35b model + research. */
        private const val LOCAL_STORY_FETCH_TIMEOUT_MS = 1_200_000L
        private const val PREVIEW_REVEAL_MAX_MS = 7_000L
        private const val PREVIEW_HOLD_MS = 7_000L
    }
}

