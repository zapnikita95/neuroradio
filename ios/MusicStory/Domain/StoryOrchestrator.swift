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
        uiState.currentTrack = track
        if uiState.pendingFeedback?.trackKey != track.displayKey {
            uiState.pendingFeedback = nil
        }
        OfflinePackStore.shared.onTrackHeard(track)

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
            if settings.manualMode && settings.factNotificationsEnabled {
                let hasHot = await storyRepository.hasHotFactForTrack(
                    artist: track.artist,
                    title: track.title
                )
                if hasHot {
                    await notifications.notifyFactHint(track: track)
                }
            } else {
                await notifications.notifyTrackChanged(track: track, autoMode: uiState.mode == .auto)
            }
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
            uiState.errorMessage = error.localizedDescription
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
        nowPlaying.resumeMusic()
        uiState.state = .listening
        uiState.errorMessage = nil
    }

    func replayHistoryStory(_ entry: StoryHistoryEntry) async {
        guard let response = storyRepository.offlineReplayResponse(for: entry.trackKey) else {
            uiState.errorMessage = "Нет сохранённой озвучки. Послушайте трек онлайн с расширенным тарифом."
            uiState.state = .error
            return
        }
        if isStoryRunning {
            stopStory()
        }
        isStoryRunning = true
        playbackSession += 1
        let session = playbackSession

        uiState.state = .preparingPlayback
        uiState.errorMessage = nil
        var musicPaused = false
        if nowPlaying.canControlPlayback(for: .manual) {
            nowPlaying.pauseMusic()
            musicPaused = true
        }

        let audioURL = storyRepository.resolvePlaybackURL(
            trackKey: entry.trackKey,
            audioURL: response.audioUrl
        )
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
                    guard session == self?.playbackSession else { return }
                    if musicPaused, self?.storyPlayer.shouldResumeMusic() == true {
                        self?.nowPlaying.resumeMusic()
                    }
                    self?.isStoryRunning = false
                    self?.uiState.state = .listening
                }
            },
            onError: { [weak self] in
                Task { @MainActor in
                    guard session == self?.playbackSession else { return }
                    if musicPaused { self?.nowPlaying.resumeMusic() }
                    self?.isStoryRunning = false
                    self?.uiState.errorMessage = "Не удалось воспроизвести историю"
                    self?.uiState.state = .error
                }
            }
        )
    }

    func clearError() {
        uiState.errorMessage = nil
        if uiState.state == .error {
            uiState.state = .listening
        }
    }

    func showError(_ message: String) {
        uiState.errorMessage = message
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
                nowPlaying.pauseMusic()
                musicPaused = true
            }

            let audioURL = storyRepository.resolvePlaybackURL(
                trackKey: track.displayKey,
                audioURL: response.audioUrl
            )
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
                        if musicPaused, self.storyPlayer.shouldResumeMusic() == true {
                            self.nowPlaying.resumeMusic()
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
                            self?.nowPlaying.resumeMusic()
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
            uiState.errorMessage = error.localizedDescription
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
            if musicPaused { nowPlaying.resumeMusic() }
            isStoryRunning = false
            uiState.errorMessage = "Озвучка не запустилась — попробуй ещё раз"
            uiState.state = .error
        }
    }
}
