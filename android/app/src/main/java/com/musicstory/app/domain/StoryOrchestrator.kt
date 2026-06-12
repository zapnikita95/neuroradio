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
import com.musicstory.app.util.TrackTitleNormalizer
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
    val pendingFeedback: PendingStoryFeedback? = null,
)

data class GenerationPreviewState(
    val words: List<String> = emptyList(),
    val visibleWordCount: Int = 0,
    val alpha: Float = 1f,
    val isActive: Boolean = false,
    /** True when [words] come from server tts_transcript (exact narration text). */
    val isSpokenTranscript: Boolean = false,
)

class StoryOrchestrator(
    private val context: Context,
    private val storyRepository: StoryRepository,
    private val scrobbleRepository: ScrobbleRepository,
    private val settingsDataStore: SettingsDataStore,
    private val mediaControllerManager: MediaControllerManager,
    private val storyPlayer: StoryPlayer,
    private val triggerEngine: TriggerEngine,
    private val factHintNotifier: FactHintNotifier = FactHintNotifier(context),
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
    /** User pressed «Отменить» / «Остановить» — no auto story on this track until next track or manual. */
    private val userCancelledTrackKeys = mutableSetOf<String>()

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
    private val _pendingFeedback = MutableStateFlow<PendingStoryFeedback?>(null)

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
            pendingFeedback = _pendingFeedback.value,
        )
        refreshManualStoryNotificationGate(generationActive)
    }

    private fun refreshManualStoryNotificationGate(isGenerationActive: Boolean) {
        scope.launch {
            val track = mediaControllerManager.effectiveNowPlaying.value
            val hasTrack = track?.isValid() == true
            val tier = storyRepository.resolveEffectiveTier()
            val hasPersonalKey = storyRepository.hasPersonalApiKeyConfigured()
            val canManual = TierAccess.canShowManualStoryButton(hasPersonalKey, tier)
            val preparing = MonitorNotificationState.preparingStory.value
            val gate = ManualStoryGate.evaluate(
                lastStoryStartedAtMs = lastStoryStartedAtMs,
                hasValidTrack = hasTrack,
                canManualStory = canManual,
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
        val tier = storyRepository.resolveEffectiveTier()
        val hasPersonalKey = storyRepository.hasPersonalApiKeyConfigured()
        val canManual = TierAccess.canShowManualStoryButton(hasPersonalKey, tier)
        val generationActive = generationInFlight ||
            activeStoryJob?.isActive == true ||
            _state.value == OrchestratorState.FETCHING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK ||
            _state.value == OrchestratorState.PLAYING_STORY
        return ManualStoryGate.evaluate(
            lastStoryStartedAtMs = lastStoryStartedAtMs,
            hasValidTrack = track?.isValid() == true,
            canManualStory = canManual,
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
        if (manualStoryInFlight && !jobDead) return
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
            if (settingsDataStore.appPowerMode.first() != AppPowerMode.ON) return@launch
            if (manualStoryInFlight) return@launch
            if (_mode.value != OrchestratorMode.AUTO || isStorySessionActive()) return@launch
            if (!storyRepository.hasOwnApiKeyConfigured()) return@launch
            if (System.currentTimeMillis() - lastStoryStartedAtMs < AUTO_TRIGGER_COOLDOWN_MS) return@launch
            val track = mediaControllerManager.effectiveNowPlaying.value ?: return@launch
            if (!track.isValid()) return@launch
            val settings = loadTriggerSettings()
            if (!settings.autoIntercept || settings.mode != TriggerMode.EVERY_N_TRACKS) return@launch
            triggerEngine.restoreTracksSinceLastStory(settingsDataStore.tracksSinceLastStory.first())
            _tracksUntilNext.value = triggerEngine.tracksUntilNext(settings)
            publishUiState()
            val counter = triggerEngine.currentTracksSinceLastStory()
            if (counter >= settings.everyNTracks) {
                StoryLog.i("Auto story overdue — triggering for ${track.artist} — ${track.title}")
                _tracksUntilNext.value = null
                playStoryForTrack(track, manual = false)
            }
        }
    }

    fun isStorySessionActive(): Boolean {
        return manualStoryInFlight ||
            generationInFlight ||
            backendFetchInFlight ||
            activeStoryJob?.isActive == true ||
            _state.value == OrchestratorState.FETCHING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK ||
            _state.value == OrchestratorState.PLAYING_STORY
    }

    /** True while user pressed «Рассказать историю» — must not cancel on metadata flicker. */
    private var manualStoryInFlight = false
    private var manualStorySession = 0

    /** User skipped to another track — the only automatic HTTP cancel besides «Отменить». */
    fun onPlaybackTrackSkipped(newTitle: String, newArtist: String) {
        if (manualStoryInFlight) return
        val inFlight = inFlightTrackKey ?: return
        val incoming = TrackTitleNormalizer.matchKey(newArtist, newTitle)
        if (inFlight == incoming) return
        storyRepository.cancelActiveStoryFetch("track skipped")
        _pendingFeedback.value = null
        scope.launch {
            cancelInFlightGeneration("track skipped", rollbackAutoTrigger = true)
        }
    }

    suspend fun onTrackChanged(track: TrackInfo) {
        if (!track.isValid()) return

        _hintMessage.value = null
        _pendingFeedback.value?.takeIf { it.trackKey != track.displayKey }?.let {
            _pendingFeedback.value = null
        }
        mediaControllerManager.restoreSystemMusicVolumeIfNeeded()

        triggerEngine.restoreTracksSinceLastStory(settingsDataStore.tracksSinceLastStory.first())

        val settings = loadTriggerSettings()
        val trackGenre = scrobbleRepository.lookupGenre(track.artist, track.title)
        val firstTrackBonus = false
        val autoStoriesEnabled = settingsDataStore.appPowerMode.first() == AppPowerMode.ON
        val suppressUntil = settingsDataStore.suppressAutoStoryUntilMs.first()
        val suppressAutoStory = System.currentTimeMillis() < suppressUntil
        val shouldTrigger = autoStoriesEnabled &&
            !suppressAutoStory &&
            _mode.value == OrchestratorMode.AUTO &&
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
            maybeNotifyFactHint(track, settings)
        }
        publishUiState()
    }

    private fun maybeNotifyFactHint(track: TrackInfo, settings: TriggerSettings) {
        if (settings.autoIntercept) return
        scope.launch {
            val enabled = settingsDataStore.factNotificationsEnabled.first()
            if (!enabled) return@launch
            if (settingsDataStore.appPowerMode.first() != AppPowerMode.ON) return@launch
            if (isStorySessionActive()) return@launch
            if (!storyRepository.hasOwnApiKeyConfigured()) return@launch
            val hasHot = withContext(Dispatchers.IO) {
                storyRepository.hasHotFactForTrack(track.artist, track.title)
            }
            factHintNotifier.maybeShow(
                track = track,
                hasHotFact = hasHot,
                enabled = enabled,
                manualMode = !settings.autoIntercept,
                storySessionActive = isStorySessionActive(),
            )
        }
    }

    fun requestManualStory(fromNotification: Boolean = false) {
        scope.launch {
            if (settingsDataStore.appPowerMode.first() == AppPowerMode.OFF) {
                showManualStoryBlocked(
                    context.getString(R.string.hint_app_power_off),
                    fromNotification,
                )
                return@launch
            }
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
            clearTrackStoryCancelled(track)
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
        val manualSession = if (manual) ++manualStorySession else 0
        if (!manual && isTrackStoryCancelled(requestedTrack)) {
            StoryLog.i("Auto story skipped — user cancelled ${requestedTrack.artist} — ${requestedTrack.title}")
            return
        }
        if (!manual && manualStoryInFlight) {
            StoryLog.i("Auto story skipped — manual fetch in flight")
            return
        }
        if (!manual && (generationInFlight || backendFetchInFlight || activeStoryJob?.isActive == true)) {
            StoryLog.i("Auto story skipped — fetch already in flight")
            return
        }
        if (manual) {
            if (manualStoryInFlight) {
                StoryLog.i("Manual story already in flight — ignore duplicate tap")
                return
            }
            manualStoryInFlight = true
            supersedePreviousStoryJobOnly()
            backendFetchInFlight = true
            MonitorNotificationState.setPreparing(true)
            _state.value = OrchestratorState.FETCHING_STORY
        }
        if (!manual) {
            _pendingFeedback.value = null
        }
        generationInFlight = true
        _errorMessage.value = null
        _hintMessage.value = null
        if (!manual &&
            _state.value != OrchestratorState.PLAYING_STORY &&
            _state.value != OrchestratorState.PREPARING_PLAYBACK
        ) {
            _state.value = OrchestratorState.LISTENING
        }
        publishUiState()

        activeStoryJob = scope.launch {
            try {
                if (!storyRepository.hasOwnApiKeyConfigured()) {
                    StoryLog.i("Story blocked: no backend and no API key")
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
                if (manual) {
                    val tier = storyRepository.resolveEffectiveTier()
                    val hasPersonalKey = storyRepository.hasPersonalApiKeyConfigured()
                    if (!TierAccess.canShowManualStoryButton(hasPersonalKey, tier)) {
                        StoryLog.i("Manual story blocked: free tier without personal API key")
                        backendFetchInFlight = false
                        MonitorNotificationState.setPreparing(false)
                        handleStoryBlockedNoApiKey(manual = true)
                        generationInFlight = false
                        return@launch
                    }
                }

                val session = ++playbackSession
                inFlightTrackKey = trackTitleKey(requestedTrack)
                cancelGenerationPreview()
                _tracksUntilNext.value = null
                publishUiState()

                try {
                    executeStoryPipeline(session, requestedTrack, manual)
                } catch (e: CancellationException) {
                    if (isUserCancelReason(e.message)) {
                        StoryLog.i("Story cancelled by user")
                        _errorMessage.value = null
                        _state.value = OrchestratorState.LISTENING
                        publishUiState()
                    } else if (e is TimeoutCancellationException) {
                        StoryLog.e("Story pipeline timeout", e)
                        val isLocal = settingsDataStore.llmProvider.first() == LlmProvider.LOCAL
                        _errorMessage.value = if (isLocal) {
                            "Слишком долго ждём локальную модель (лимит 20 мин). Смотри логи: Music story\\logs\\local-bff.log"
                        } else {
                            "Сервер не ответил за 5 мин (факты + текст + озвучка). Подожди — история может ещё готовиться на сервере."
                        }
                        _state.value = OrchestratorState.ERROR
                        publishUiState()
                    } else if (manual && !isUserCancelReason(e.message)) {
                        StoryLog.w("Manual story cancelled by app: ${e.message}")
                        _errorMessage.value = "Запрос прерван приложением. Нажми «Рассказать историю» ещё раз."
                        _state.value = OrchestratorState.ERROR
                        publishUiState()
                    } else {
                        StoryLog.i("Story pipeline cancelled: ${e.message}")
                        _errorMessage.value = null
                        if (_state.value != OrchestratorState.LISTENING) {
                            _state.value = OrchestratorState.LISTENING
                            publishUiState()
                        }
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
                        } else if (activeStoryJob?.isActive != true && !manualStoryInFlight) {
                            _state.value = OrchestratorState.LISTENING
                            publishUiState()
                        }
                    }
                    reconcileGenerationState()
                }
            } finally {
                if (manual && manualSession == manualStorySession) {
                    manualStoryInFlight = false
                }
            }
        }
    }

    /** Manual button: drop only a previous job — do not reset «Готовим историю» for the new request. */
    private fun supersedePreviousStoryJobOnly() {
        val hadJob = activeStoryJob?.isActive == true
        if (hadJob) {
            if (backendFetchInFlight) {
                StoryLog.i("Manual supersede suppressed — story HTTP in flight")
                return
            }
            storyRepository.cancelActiveStoryFetch("manual supersede")
            activeStoryJob?.cancel(CancellationException("superseded"))
            playbackSession++
        }
        activeStoryJob = null
        inFlightTrackKey = null
        cancelGenerationPreview()
    }

    /** Only real user skip/stop may kill HTTP; auto/supersede must not rip manual fetch. */
    private fun shouldAbortInFlightStory(reason: String): Boolean {
        if (reason == "stopped by user" || reason == "track skipped") return true
        if (manualStoryInFlight) return false
        return true
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
        suspend fun runFetch(): Result<com.musicstory.app.data.model.StoryResponse> =
            withTimeout(fetchTimeoutMs) {
                storyRepository.fetchStory(track, forceRefresh = true)
            }

        val result = try {
            runFetch()
        } finally {
            backendFetchInFlight = false
            MonitorNotificationState.setPreparing(false)
            MediaMonitorService.refreshNotification(context)
        }
        if (!isSessionCurrent(session) || !isTrackStillCurrent(session, track)) {
            StoryLog.i("Track changed during fetch — discard ${track.artist}")
            abortGeneration(session, manual, rollbackAutoTrigger = !manual)
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
                if (isTrackStoryCancelled(track)) {
                    StoryLog.i("Story ready but user cancelled this track — discard playback")
                    abortGeneration(session, manual, rollbackAutoTrigger = false)
                    return@fold
                }

                startGenerationPreview(
                    normalizeUserFacingTranscript(response.ttsTranscript ?: response.script),
                    session,
                    response.ttsTranscript != null,
                )

                if (!isSessionCurrent(session)) return@fold

                storyMutex.withLock {
                    if (!isSessionCurrent(session) || !isTrackStillCurrent(session, track)) return@withLock

                    _state.value = OrchestratorState.PREPARING_PLAYBACK
                    publishUiState()

                    withContext(Dispatchers.Main.immediate) {
                        mediaControllerManager.fadeOutAndPause(fadeSeconds)
                        mediaControllerManager.restoreStreamVolumeForStoryPlayback()
                    }
                    musicPausedForStory.set(true)
                    if (!manual) {
                        triggerEngine.onStoryPlaybackStarted()
                        settingsDataStore.setTracksSinceLastStory(0)
                        settingsDataStore.setFirstAutoStoryCompleted(true)
                        refreshTracksUntilNext()
                    }

                    fun handleAudioPlaybackFailed() {
                        mediaControllerManager.restoreSystemMusicVolumeIfNeeded()
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
                    }

                    suspend fun startStoryPlayback(
                        response: com.musicstory.app.data.model.StoryResponse,
                        playbackRetry: Boolean = false,
                    ) {
                        val audioUrl = storyRepository.resolvePlaybackUrl(
                            track.displayKey,
                            response.audioUrl,
                            preferLocal = false,
                            forceFullDownload = playbackRetry,
                        )
                        storyPlayer.playStory(
                            response = response,
                            audioUrl = audioUrl,
                            speechRate = ttsSpeed,
                            resumeMusic = true,
                            onPlaybackStarted = {
                                if (!isSessionCurrent(session)) return@playStory
                                mediaControllerManager.restoreStreamVolumeForStoryPlayback()
                                lastStoryStartedAtMs = System.currentTimeMillis()
                                _state.value = OrchestratorState.PLAYING_STORY
                                publishUiState()
                            },
                            onFinished = {
                                if (!isSessionCurrent(session)) return@playStory
                                cancelGenerationPreview()
                                mediaControllerManager.restoreSystemMusicVolumeIfNeeded()
                                if (musicPausedForStory.get() && storyPlayer.shouldResumeMusic()) {
                                    scope.launch {
                                        mediaControllerManager.resumeMusicWithFade(fadeSeconds)
                                    }
                                }
                                _errorMessage.value = null
                                scope.launch {
                                    storyRepository.recordStoryPlaybackComplete(response)
                                    val trackKey = requestedTrack.displayKey
                                    val existingVote = storyRepository.hasVoteForStory(
                                        trackKey,
                                        response.script,
                                    )
                                    _pendingFeedback.value = if (!existingVote) {
                                        PendingStoryFeedback(
                                            artist = response.artist,
                                            title = response.title,
                                            script = response.script,
                                            trackKey = trackKey,
                                        )
                                    } else {
                                        null
                                    }
                                    _state.value = OrchestratorState.LISTENING
                                    refreshTracksUntilNext()
                                    publishUiState()
                                }
                            },
                            onError = {
                                if (!isSessionCurrent(session)) return@playStory
                                cancelGenerationPreview()
                                scope.launch {
                                    if (!playbackRetry) {
                                        storyRepository.evictLocalAudio(track.displayKey)
                                        storyRepository.evictEphemeralPlayback(response.audioUrl)
                                        StoryLog.w("Retrying story audio: download full file after stream error")
                                        startStoryPlayback(response, playbackRetry = true)
                                        return@launch
                                    }
                                    StoryLog.w(
                                        "Server audio playback failed after URL retries — not refetching story",
                                    )
                                    handleAudioPlaybackFailed()
                                }
                            },
                        )
                    }

                    startStoryPlayback(response)
                    scrobbleRepository.markStoryTriggered(track)
                    schedulePlaybackWatchdog(session, musicPausedForStory)
                }
            },
            onFailure = { error ->
                if (error is CancellationException || error.wasStoryRequestCancelled()) {
                    _errorMessage.value = null
                    if (_state.value != OrchestratorState.LISTENING) {
                        _state.value = OrchestratorState.LISTENING
                    }
                    publishUiState()
                    return@fold
                }
                cancelGenerationPreview()
                if (!manual) {
                    val everyN = settingsDataStore.everyNTracks.first()
                    triggerEngine.rollbackFailedStoryTrigger(everyN)
                    settingsDataStore.setTracksSinceLastStory(
                        triggerEngine.currentTracksSinceLastStory(),
                    )
                    val msg = error.message?.trim().orEmpty()
                    if (msg.contains("не получилось", ignoreCase = true)) {
                        _errorMessage.value = null
                        _hintMessage.value = msg
                        _state.value = OrchestratorState.LISTENING
                    } else {
                        _errorMessage.value = null
                        _hintMessage.value = msg.take(160).ifBlank {
                            "Не получилось рассказать историю"
                        }
                        _state.value = OrchestratorState.LISTENING
                    }
                } else {
                    _errorMessage.value = error.message ?: "Не удалось получить историю"
                    _hintMessage.value = null
                    _state.value = OrchestratorState.ERROR
                }
                publishUiState()
            },
        )
    }

    private fun Throwable.wasStoryRequestCancelled(): Boolean {
        val msg = message.orEmpty()
        return msg.contains("cancel", ignoreCase = true) ||
            msg.contains("отмен", ignoreCase = true) ||
            msg.contains("499")
    }

    private fun trackTitleKey(track: TrackInfo): String =
        TrackTitleNormalizer.matchKey(track)

    private fun resolveActiveTrackKey(): String? =
        inFlightTrackKey ?: mediaControllerManager.effectiveNowPlaying.value?.let { trackTitleKey(it) }

    private fun markTrackStoryCancelled(trackKey: String) {
        userCancelledTrackKeys.add(trackKey)
        StoryLog.i("Story cancelled for track key=$trackKey — wait for next track or manual")
    }

    private fun isTrackStoryCancelled(track: TrackInfo): Boolean =
        userCancelledTrackKeys.contains(trackTitleKey(track))

    private fun clearTrackStoryCancelled(track: TrackInfo) {
        userCancelledTrackKeys.remove(trackTitleKey(track))
    }

    private fun isUserCancelReason(reason: String?): Boolean =
        reason == "stopped by user" ||
            reason?.contains("stopped by user", ignoreCase = true) == true

    private fun cancelInFlightGenerationImmediate(reason: String) {
        if (!shouldAbortInFlightStory(reason)) {
            StoryLog.i("Keep in-flight story ($reason) — manual request active")
            return
        }
        if (backendFetchInFlight && reason != "stopped by user") {
            StoryLog.i("Story generation cancel suppressed during HTTP: $reason")
            return
        }
        if (reason == "track skipped" || reason == "stopped by user") {
            storyRepository.cancelActiveStoryFetch(reason)
        }
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
        if (!shouldAbortInFlightStory(reason)) {
            StoryLog.i("Keep in-flight story ($reason) — manual request active")
            return
        }
        if (backendFetchInFlight && reason != "stopped by user") {
            StoryLog.i("Story generation cancel suppressed during HTTP: $reason")
            return
        }
        if (reason == "track skipped" || reason == "stopped by user") {
            storyRepository.cancelActiveStoryFetch(reason)
        }
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
        val current = mediaControllerManager.resolveNowPlayingTrack()
            ?: mediaControllerManager.effectiveNowPlaying.value
            ?: return true
        return trackTitleKey(current) == trackTitleKey(track)
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
            if (storyPlayer.state.value == StoryPlaybackState.PREPARING) {
                StoryLog.w("Playback watchdog: still buffering server audio — waiting for ExoPlayer")
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

    fun clearFeedbackPrompt() {
        _pendingFeedback.value = null
        publishUiState()
    }

    fun clearFeedbackIfTrack(trackKey: String) {
        if (_pendingFeedback.value?.trackKey == trackKey) {
            clearFeedbackPrompt()
        }
    }

    fun clearFeedbackIfStory(trackKey: String, script: String) {
        val pending = _pendingFeedback.value ?: return
        if (pending.trackKey == trackKey && pending.script == script) {
            clearFeedbackPrompt()
        }
    }

    /** Сброс залипшего «Готовим историю» при открытии главного экрана. */
    fun recoverStaleUi() {
        reconcileGenerationState()
        publishUiState()
    }

    /** После welcome-trial / billing — обновить кнопку «Рассказать» и уведомление. */
    fun notifyTierMayHaveChanged() {
        val generationActive = generationInFlight ||
            activeStoryJob?.isActive == true ||
            _state.value == OrchestratorState.FETCHING_STORY ||
            _state.value == OrchestratorState.PREPARING_PLAYBACK ||
            _state.value == OrchestratorState.PLAYING_STORY
        refreshManualStoryNotificationGate(generationActive)
        publishUiState()
    }

    fun cancelGeneration() {
        stopStory()
    }

    fun stopStory() {
        val cancelledTrackKey = resolveActiveTrackKey()
        val wasManual = manualStoryInFlight
        manualStoryInFlight = false
        manualStorySession++
        cancelledTrackKey?.let(::markTrackStoryCancelled)
        cancelInFlightGenerationImmediate("stopped by user")
        storyPlayer.stop()
        mediaControllerManager.restoreSystemMusicVolumeIfNeeded()
        _errorMessage.value = null
        _hintMessage.value = null
        _pendingFeedback.value = null
        _state.value = OrchestratorState.LISTENING
        scope.launch {
            if (!wasManual) {
                val everyN = settingsDataStore.everyNTracks.first()
                triggerEngine.rollbackFailedStoryTrigger(everyN)
                settingsDataStore.setTracksSinceLastStory(
                    triggerEngine.currentTracksSinceLastStory(),
                )
                refreshTracksUntilNext()
            }
            val fadeSeconds = settingsDataStore.musicFadeSeconds.first()
            if (fadeSeconds > 0f) {
                mediaControllerManager.resumeMusicWithFade(fadeSeconds)
            } else {
                mediaControllerManager.resumeMusic()
            }
        }
        publishUiState()
    }

    /** Replay saved OGG from history — no network fetch. */
    fun replayHistoryStory(entry: com.musicstory.app.data.local.StoryHistoryEntry) {
        scope.launch {
            val response = storyRepository.getOfflineReplayResponse(entry.trackKey)
            if (response == null) {
                _hintMessage.value = context.getString(R.string.offline_replay_unavailable)
                publishUiState()
                return@launch
            }
            if (isStorySessionActive()) {
                stopStory()
            }
            val track = TrackInfo(artist = entry.artist, title = entry.title)
            playbackSession++
            val session = playbackSession
            _state.value = OrchestratorState.PREPARING_PLAYBACK
            _errorMessage.value = null
            _hintMessage.value = null
            publishUiState()

            val fadeSeconds = settingsDataStore.musicFadeSeconds.first()
            val ttsSpeed = settingsDataStore.ttsSpeed.first().androidRate
            withContext(Dispatchers.Main.immediate) {
                mediaControllerManager.fadeOutAndPause(fadeSeconds)
                mediaControllerManager.restoreStreamVolumeForStoryPlayback()
            }

            val audioUrl = storyRepository.resolvePlaybackUrl(
                entry.trackKey,
                response.audioUrl,
                preferLocal = true,
            )
            storyPlayer.playStory(
                response = response,
                audioUrl = audioUrl,
                speechRate = ttsSpeed,
                resumeMusic = true,
                onPlaybackStarted = {
                    if (!isSessionCurrent(session)) return@playStory
                    mediaControllerManager.restoreStreamVolumeForStoryPlayback()
                    _state.value = OrchestratorState.PLAYING_STORY
                    publishUiState()
                },
                onFinished = {
                    if (!isSessionCurrent(session)) return@playStory
                    mediaControllerManager.resumeMusic()
                    _state.value = OrchestratorState.LISTENING
                    publishUiState()
                },
                onError = {
                    if (!isSessionCurrent(session)) return@playStory
                    mediaControllerManager.resumeMusic()
                    _errorMessage.value = context.getString(R.string.server_audio_error_message)
                    _state.value = OrchestratorState.ERROR
                    publishUiState()
                },
            )
        }
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

    private fun normalizeUserFacingTranscript(text: String): String =
        text
            .replace(Regex("""й\+?утй\+?уб""", RegexOption.IGNORE_CASE), "YouTube")
            .replace(Regex("""ют\+?уб""", RegexOption.IGNORE_CASE), "YouTube")

    private fun startGenerationPreview(script: String, session: Int, isSpokenTranscript: Boolean = false) {
        val words = script.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty()) return

        previewJob?.cancel()
        previewJob = scope.launch {
            val estimatedDurationMs = estimatedStoryDurationMs(words.size)
            val waitStartMs = System.currentTimeMillis()

            _generationPreview.value = GenerationPreviewState(
                words = words,
                visibleWordCount = 0,
                alpha = 1f,
                isActive = true,
                isSpokenTranscript = isSpokenTranscript,
            )
            publishUiState()

            var lastCount = 0
            while (session == playbackSession) {
                val playerState = storyPlayer.state.value
                val progress = storyPlayer.playbackProgress.value

                val count = when (playerState) {
                    StoryPlaybackState.COMPLETED -> words.size
                    StoryPlaybackState.PLAYING, StoryPlaybackState.PAUSED -> {
                        visibleWordsFromPlayback(
                            wordCount = words.size,
                            progress = progress,
                            elapsedMs = System.currentTimeMillis() - waitStartMs,
                            estimatedDurationMs = estimatedDurationMs,
                        )
                    }
                    else -> 0
                }

                if (count != lastCount) {
                    lastCount = count
                    _generationPreview.value = _generationPreview.value.copy(visibleWordCount = count)
                    publishUiState()
                }

                if (playerState == StoryPlaybackState.COMPLETED) break
                delay(40L)
            }

            if (session != playbackSession) return@launch
            _generationPreview.value = _generationPreview.value.copy(
                visibleWordCount = words.size,
                alpha = 1f,
                isActive = true,
            )
            publishUiState()
        }
    }

    private fun wordRevealDelayMs(wordCount: Int, revealMaxMs: Long = PREVIEW_REVEAL_MAX_MS): Long {
        if (wordCount <= 1) return 0L
        return (revealMaxMs / wordCount).coerceIn(40L, 160L)
    }

    /** Rough TTS length for word-by-word preview when ExoPlayer progress is unavailable. */
    private fun estimatedStoryDurationMs(wordCount: Int): Long =
        (wordCount * 320L).coerceIn(5_000L, 240_000L)

    /** Keep visible text in sync with speech — reveal from the first word, no early jump to the end. */
    private fun visibleWordsFromPlayback(
        wordCount: Int,
        progress: Float,
        elapsedMs: Long,
        estimatedDurationMs: Long,
    ): Int {
        if (wordCount <= 0) return 0

        val fromProgress = (progress * wordCount * 1.04f).toInt().coerceIn(0, wordCount)
        val fromClock = if (elapsedMs > 0L) {
            ((elapsedMs.toFloat() / estimatedDurationMs) * wordCount * 1.08f).toInt()
                .coerceIn(0, wordCount)
        } else {
            0
        }

        val warmUpCap = when {
            elapsedMs < 450L -> 1
            elapsedMs < 1_000L -> minOf(3, wordCount)
            elapsedMs < 1_800L -> minOf(8, wordCount)
            else -> wordCount
        }

        return if (elapsedMs < 1_800L) {
            minOf(maxOf(fromProgress, fromClock), warmUpCap)
        } else {
            maxOf(fromProgress, fromClock).coerceIn(0, wordCount)
        }
    }

    companion object {
        private const val PLAYBACK_START_TIMEOUT_MS = 55_000L
        /** Metadata + backend /v1/story/full (facts + LLM + Yandex TTS). */
        private const val STORY_FETCH_TIMEOUT_MS = 300_000L
        /** Local Ollama on PC BFF — 35b model + research. */
        private const val LOCAL_STORY_FETCH_TIMEOUT_MS = 1_200_000L
        private const val PREVIEW_REVEAL_MAX_MS = 7_000L
        /** After a story starts, ignore stale counter≥N in DataStore (manual/auto race). */
        private const val AUTO_TRIGGER_COOLDOWN_MS = 45_000L
    }
}

