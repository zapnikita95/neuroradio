import Foundation

enum OrchestratorMode {
    case auto
    case manual
}

enum OrchestratorState {
    case idle
    case listening
    case fetchingStory
    case preparingPlayback
    case playingStory
    case error
}

struct PendingStoryFeedback: Equatable {
    let artist: String
    let title: String
    let script: String
    let trackKey: String
}

struct OrchestratorUiState {
    var mode: OrchestratorMode = .auto
    var state: OrchestratorState = .idle
    var currentTrack: TrackInfo?
    var errorMessage: String?
    var tracksUntilNext: Int?
    var isMonitoringActive = false
    var pendingFeedback: PendingStoryFeedback?
}

@MainActor
final class StoryOrchestrator: ObservableObject {
    @Published private(set) var uiState = OrchestratorUiState()

    private let storyRepository = StoryRepository.shared
    private let historyStore = StoryHistoryStore.shared
    private let settings = SettingsStore.shared
    private let nowPlaying: NowPlayingCoordinator
    private let storyPlayer: StoryPlayer
    private let triggerEngine = TriggerEngine()
    private let notifications = NotificationService.shared

    private var playbackSession = 0
    private var isStoryRunning = false

    init(nowPlaying: NowPlayingCoordinator, storyPlayer: StoryPlayer) {
        self.nowPlaying = nowPlaying
        self.storyPlayer = storyPlayer

        nowPlaying.onTrackChanged = { [weak self] track in
            Task { @MainActor in
                await self?.onTrackChanged(track)
            }
        }
    }

    func startMonitoring() {
        uiState.isMonitoringActive = true
        if uiState.state == .idle {
            uiState.state = .listening
        }
        syncModeFromSettings()
    }

    func stopMonitoring() {
        uiState.isMonitoringActive = false
    }

    func syncModeFromSettings() {
        uiState.mode = settings.manualMode ? .manual : .auto
        uiState.currentTrack = nowPlaying.currentTrack
    }

    func onTrackChanged(_ track: TrackInfo) async {
        guard track.isValid() else { return }
        if uiState.pendingFeedback?.trackKey != track.displayKey {
            uiState.pendingFeedback = nil
        }
        uiState.currentTrack = track

        guard !historyStore.wasRecentlyScrobbled(track.displayKey) else { return }

        let triggerSettings = settings.triggerSettings
        let shouldTrigger = uiState.mode == .auto &&
            triggerEngine.onTrackPlayed(
                settings: triggerSettings,
                trackKey: track.displayKey,
                trackArtist: track.artist,
                trackGenre: nil
            )

        historyStore.logScrobble(track, storyTriggered: shouldTrigger)
        uiState.tracksUntilNext = triggerEngine.tracksUntilNext(settings: triggerSettings)

        if shouldTrigger {
            await playStory(for: track, manual: false)
        } else if !isStoryRunning {
            uiState.state = .listening
            await notifications.notifyTrackChanged(track: track, autoMode: uiState.mode == .auto)
        }
    }

    func requestManualStory() async {
        if var track = nowPlaying.currentTrack, track.isValid() {
            await playStory(for: track, manual: true)
            return
        }

        uiState.state = .fetchingStory
        uiState.errorMessage = nil
        do {
            let track = try await nowPlaying.recognizeWithShazam()
            await playStory(for: track, manual: true)
        } catch {
            uiState.errorMessage = UserFacingError.message(for: error)
            uiState.state = .error
        }
    }

    func requestManualStory(artist: String, title: String) async {
        let track = TrackInfo(artist: artist, title: title, source: .manual)
        nowPlaying.setManualTrack(track)
        await playStory(for: track, manual: true)
    }

    func requestStoryFromNotification(artist: String, title: String) async {
        let track = TrackInfo(artist: artist, title: title, source: .manual)
        nowPlaying.setManualTrack(track)
        await playStory(for: track, manual: true)
    }

    func stopStory() {
        playbackSession += 1
        isStoryRunning = false
        uiState.pendingFeedback = nil
        storyPlayer.stop()
        Task {
            await nowPlaying.resumeMusicWithFade(seconds: settings.musicFadeSeconds)
        }
        uiState.state = .listening
        uiState.errorMessage = nil
    }

    func clearError() {
        uiState.errorMessage = nil
        if uiState.state == .error {
            uiState.state = .listening
        }
    }

    func showError(_ message: String) {
        uiState.errorMessage = UserFacingError.message(for: message)
        uiState.state = .error
    }

    func showError(_ error: Error) {
        uiState.errorMessage = UserFacingError.message(for: error)
        uiState.state = .error
    }

    func clearFeedbackPrompt() {
        uiState.pendingFeedback = nil
    }

    func clearFeedbackIfStory(trackKey: String, script: String) {
        guard let pending = uiState.pendingFeedback else { return }
        if pending.trackKey == trackKey && pending.script == script {
            uiState.pendingFeedback = nil
        }
    }

    private func playStory(for track: TrackInfo, manual: Bool) async {
        guard !isStoryRunning else { return }
        isStoryRunning = true
        playbackSession += 1
        let session = playbackSession

        uiState.state = .fetchingStory
        uiState.errorMessage = nil
        uiState.currentTrack = track

        let fetchStarted = Date()
        let result = await storyRepository.fetchStory(track: track, forceRefresh: true)

        guard session == playbackSession else {
            isStoryRunning = false
            return
        }

        switch result {
        case .success(let response):
            if !manual {
                let elapsed = Date().timeIntervalSince(fetchStarted)
                let remaining = max(0, 8.0 - elapsed)
                if remaining > 0 {
                    try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
                }
            }

            guard session == playbackSession else {
                isStoryRunning = false
                return
            }

            uiState.state = .preparingPlayback
            var musicPaused = false
            if nowPlaying.canControlPlayback(for: track.source) {
                await nowPlaying.fadeOutAndPause(seconds: settings.musicFadeSeconds)
                musicPaused = true
                if !manual {
                    triggerEngine.onStoryPlaybackStarted()
                    uiState.tracksUntilNext = triggerEngine.tracksUntilNext(settings: settings.triggerSettings)
                }
            }

            await nowPlaying.restoreVolumeIfNeeded()

            let audioURL = storyRepository.resolveAudioURL(response.audioUrl)
            storyPlayer.playStory(
                response: response,
                audioURL: audioURL,
                speechRate: settings.ttsSpeedPreset.speechRate,
                resumeMusic: true,
                onPlaybackStarted: { [weak self] in
                    Task { @MainActor in
                        guard session == self?.playbackSession else { return }
                        self?.uiState.state = .playingStory
                    }
                },
                onFinished: { [weak self] in
                    Task { @MainActor in
                        guard let self, session == self.playbackSession else { return }
                        if musicPaused, self.storyPlayer.shouldResumeMusic() {
                            await self.nowPlaying.resumeMusicWithFade(seconds: self.settings.musicFadeSeconds)
                        }
                        self.isStoryRunning = false
                        let trackKey = track.displayKey
                        let script = response.script
                        if !self.historyStore.hasVoteForStory(trackKey: trackKey, script: script) {
                            self.uiState.pendingFeedback = PendingStoryFeedback(
                                artist: response.artist,
                                title: response.title,
                                script: script,
                                trackKey: trackKey
                            )
                        } else {
                            self.uiState.pendingFeedback = nil
                        }
                        self.uiState.state = .listening
                        self.uiState.errorMessage = nil
                    }
                },
                onError: { [weak self] in
                    Task { @MainActor in
                        guard session == self?.playbackSession else { return }
                        if musicPaused {
                            if !manual {
                                self?.triggerEngine.rollbackFailedStoryTrigger(
                                    everyNTracks: self?.settings.everyNTracks ?? SettingsDefaults.everyNTracks
                                )
                                self?.uiState.tracksUntilNext = self?.triggerEngine.tracksUntilNext(
                                    settings: self?.settings.triggerSettings ?? TriggerSettings()
                                )
                            }
                            await self?.nowPlaying.resumeMusicWithFade(seconds: self?.settings.musicFadeSeconds ?? 2)
                        }
                        self?.isStoryRunning = false
                        self?.uiState.errorMessage = "Не удалось воспроизвести историю"
                        self?.uiState.state = .error
                    }
                }
            )

            schedulePlaybackWatchdog(session: session, musicPaused: musicPaused)

        case .failure(let error):
            isStoryRunning = false
            if !manual {
                triggerEngine.rollbackFailedStoryTrigger(everyNTracks: settings.everyNTracks)
                uiState.tracksUntilNext = triggerEngine.tracksUntilNext(settings: settings.triggerSettings)
            }
            uiState.errorMessage = UserFacingError.message(for: error)
            uiState.state = .error
        }
    }

    private func schedulePlaybackWatchdog(session: Int, musicPaused: Bool) {
        Task {
            try? await Task.sleep(nanoseconds: 25_000_000_000)
            guard session == playbackSession else { return }
            guard uiState.state == .preparingPlayback || uiState.state == .playingStory else { return }
            if uiState.state == .playingStory, storyPlayer.state == .playing { return }

            storyPlayer.stop()
            if musicPaused {
                await nowPlaying.resumeMusicWithFade(seconds: settings.musicFadeSeconds)
            }
            isStoryRunning = false
            uiState.errorMessage = "Озвучка не запустилась — попробуй ещё раз"
            uiState.state = .error
        }
    }
}
