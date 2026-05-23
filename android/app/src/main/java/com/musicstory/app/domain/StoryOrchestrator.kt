package com.musicstory.app.domain

import com.musicstory.app.data.local.SettingsDataStore
import com.musicstory.app.data.model.StoryResponse
import com.musicstory.app.data.model.TrackInfo
import com.musicstory.app.data.repository.ScrobbleRepository
import com.musicstory.app.data.repository.StoryRepository
import com.musicstory.app.media.MediaControllerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

enum class OrchestratorMode {
    AUTO,
    MANUAL,
}

enum class OrchestratorState {
    IDLE,
    LISTENING,
    FETCHING_STORY,
    PLAYING_STORY,
    ERROR,
}

data class OrchestratorUiState(
    val mode: OrchestratorMode = OrchestratorMode.AUTO,
    val state: OrchestratorState = OrchestratorState.IDLE,
    val currentTrack: TrackInfo? = null,
    val lastStory: StoryResponse? = null,
    val errorMessage: String? = null,
    val tracksUntilNext: Int? = null,
    val isServiceRunning: Boolean = false,
    val fetchNote: String? = null,
)

class StoryOrchestrator(
    private val storyRepository: StoryRepository,
    private val scrobbleRepository: ScrobbleRepository,
    private val settingsDataStore: SettingsDataStore,
    private val mediaControllerManager: MediaControllerManager,
    private val storyPlayer: StoryPlayer,
    private val triggerEngine: TriggerEngine,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val storyMutex = Mutex()

    private val _mode = MutableStateFlow(OrchestratorMode.AUTO)
    val mode: StateFlow<OrchestratorMode> = _mode.asStateFlow()

    private val _state = MutableStateFlow(OrchestratorState.IDLE)
    val state: StateFlow<OrchestratorState> = _state.asStateFlow()

    private val _lastStory = MutableStateFlow<StoryResponse?>(null)
    val lastStory: StateFlow<StoryResponse?> = _lastStory.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _tracksUntilNext = MutableStateFlow<Int?>(null)
    val tracksUntilNext: StateFlow<Int?> = _tracksUntilNext.asStateFlow()

    private val _serviceRunning = MutableStateFlow(false)
    val serviceRunning: StateFlow<Boolean> = _serviceRunning.asStateFlow()

    private val _uiState = MutableStateFlow(OrchestratorUiState())
    val uiState: StateFlow<OrchestratorUiState> = _uiState.asStateFlow()

    private fun publishUiState() {
        _uiState.value = OrchestratorUiState(
            mode = _mode.value,
            state = _state.value,
            currentTrack = mediaControllerManager.nowPlaying.value,
            lastStory = _lastStory.value,
            errorMessage = _errorMessage.value,
            tracksUntilNext = _tracksUntilNext.value,
            isServiceRunning = _serviceRunning.value,
            fetchNote = storyRepository.lastFetchNote.value,
        )
    }

    init {
        scope.launch {
            storyRepository.lastFetchNote.collect {
                publishUiState()
            }
        }

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
                when (playbackState) {
                    StoryPlaybackState.PLAYING, StoryPlaybackState.PREPARING -> {
                        _state.value = OrchestratorState.PLAYING_STORY
                    }
                    StoryPlaybackState.COMPLETED, StoryPlaybackState.IDLE -> {
                        if (_state.value == OrchestratorState.PLAYING_STORY) {
                            _state.value = OrchestratorState.LISTENING
                        }
                    }
                    StoryPlaybackState.ERROR -> {
                        _errorMessage.value = "Ошибка воспроизведения истории"
                        _state.value = OrchestratorState.ERROR
                    }
                    else -> Unit
                }
                publishUiState()
            }
        }
    }

    fun setServiceRunning(running: Boolean) {
        _serviceRunning.value = running
        if (running && _state.value == OrchestratorState.IDLE) {
            _state.value = OrchestratorState.LISTENING
        }
        publishUiState()
    }

    suspend fun onTrackChanged(track: TrackInfo) {
        if (!track.isValid()) return

        val settings = loadTriggerSettings()
        val shouldTrigger = _mode.value == OrchestratorMode.AUTO &&
            triggerEngine.onTrackPlayed(
                settings = settings,
                trackKey = track.displayKey,
                trackArtist = track.artist,
                trackGenre = null,
            )

        _tracksUntilNext.value = triggerEngine.tracksUntilNext(settings)
        scrobbleRepository.recordTrack(track, storyTriggered = shouldTrigger)

        if (shouldTrigger) {
            playStoryForTrack(track, manual = false)
        } else if (_state.value != OrchestratorState.PLAYING_STORY) {
            _state.value = OrchestratorState.LISTENING
        }
        publishUiState()
    }

    fun requestManualStory() {
        val track = mediaControllerManager.nowPlaying.value
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

    private suspend fun playStoryForTrack(track: TrackInfo, manual: Boolean) {
        storyMutex.withLock {
            _state.value = OrchestratorState.FETCHING_STORY
            _errorMessage.value = null
            publishUiState()

            mediaControllerManager.pauseMusic()

            val result = storyRepository.fetchStory(track, forceRefresh = true)
            result.fold(
                onSuccess = { response ->
                    _lastStory.value = response
                    val audioUrl = storyRepository.resolveAudioUrl(response.audioUrl)
                    storyPlayer.playStory(
                        response = response,
                        audioUrl = audioUrl,
                        resumeMusic = true,
                        onFinished = {
                            if (storyPlayer.shouldResumeMusic()) {
                                mediaControllerManager.resumeMusic()
                            }
                            _state.value = OrchestratorState.LISTENING
                        },
                    )
                    scrobbleRepository.recordTrack(track, storyTriggered = true)
                    _state.value = OrchestratorState.PLAYING_STORY
                    publishUiState()
                },
                onFailure = { error ->
                    _errorMessage.value = error.message ?: "Не удалось получить историю"
                    _state.value = OrchestratorState.ERROR
                    mediaControllerManager.resumeMusic()
                    publishUiState()
                },
            )
        }
    }

    fun stopStory() {
        storyPlayer.stop()
        mediaControllerManager.resumeMusic()
        _state.value = OrchestratorState.LISTENING
        publishUiState()
    }

    fun clearError() {
        _errorMessage.value = null
        if (_state.value == OrchestratorState.ERROR) {
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
}
