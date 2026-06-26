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

struct GenerationPreviewState: Equatable {
    var words: [String] = []
    var visibleWordCount: Int = 0
    var isActive: Bool = false
    var isSpokenTranscript: Bool = false
}

struct OrchestratorUiState {
    var mode: OrchestratorMode = .auto
    var state: OrchestratorState = .idle
    var currentTrack: TrackInfo?
    var errorMessage: String?
    var tracksUntilNext: Int?
    var isMonitoringActive = false
    var pendingFeedback: PendingStoryFeedback?
    var generationPreview = GenerationPreviewState()
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
    private var previewTask: Task<Void, Never>?
    private var storyFetchTask: Task<Result<StoryResponse, Error>, Never>?
    /// Ручной запрос истории из настроек — не сбрасывать UI в onTrackChanged.
    private var explicitManualStoryRequest = false

    private static let storyFetchTimeoutNs: UInt64 = 480 * 1_000_000_000

    init(nowPlaying: NowPlayingCoordinator, storyPlayer: StoryPlayer) {
        self.nowPlaying = nowPlaying
        self.storyPlayer = storyPlayer

        nowPlaying.onTrackChanged = { [weak self] track in
            Task { @MainActor in
                await self?.onTrackChanged(track)
            }
        }
        nowPlaying.onTrackHeard = { [weak self] track in
            Task { @MainActor in
                self?.recordTrackHeard(track)
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
        uiState.errorMessage = nil
        if uiState.state == .error {
            uiState.state = .listening
        }
        if explicitManualStoryRequest {
            return
        }
        if uiState.pendingFeedback?.trackKey != track.displayKey {
            uiState.pendingFeedback = nil
        }
        OfflinePackStore.shared.onTrackHeard(track)

        let triggerSettings = settings.triggerSettings
        let shouldTrigger = uiState.mode == .auto &&
            triggerEngine.onTrackPlayed(
                settings: triggerSettings,
                trackKey: track.displayKey,
                trackArtist: track.artist,
                trackGenre: nil
            )

        uiState.tracksUntilNext = triggerEngine.tracksUntilNext(settings: triggerSettings)

        if shouldTrigger {
            await playStory(for: track, manual: false)
        } else if !isStoryRunning,
                  uiState.state != .fetchingStory,
                  uiState.state != .preparingPlayback {
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

    /// Listening history — Shazam, Spotify, Apple Music, manual input.
    func recordTrackHeard(_ track: TrackInfo) {
        guard track.isValid() else { return }
        guard !historyStore.wasRecentlyScrobbled(track.displayKey) else { return }
        historyStore.logScrobble(track, storyTriggered: false)
    }

    private func markStoryTriggered(for track: TrackInfo) {
        historyStore.markLatestScrobbleStoryTriggered(trackKey: track.displayKey)
    }

    func requestManualStory() async {
        if isStoryRunning { stopStory() }

        if var track = nowPlaying.currentTrack, track.isValid() {
            uiState.state = .fetchingStory
            uiState.errorMessage = nil
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
        if isStoryRunning { stopStory() }

        let track = TrackInfo(artist: artist, title: title, source: .manual)
        guard track.isValid() else {
            let copy = AppStrings.l10n(settings.resolvedLanguage)
            uiState.errorMessage = copy.manualTrackRequired
            uiState.state = .error
            return
        }

        explicitManualStoryRequest = true
        defer { explicitManualStoryRequest = false }

        uiState.state = .fetchingStory
        uiState.errorMessage = nil
        uiState.currentTrack = track
        nowPlaying.setManualTrack(track)
        await playStory(for: track, manual: true)
    }

    /// Запуск из настроек — Task живёт в orchestrator, не в SettingsView.
    func beginManualStoryFromSettings(artist: String, title: String) {
        Task { await requestManualStory(artist: artist, title: title) }
    }

    func requestStoryFromNotification(artist: String, title: String) async {
        let track = TrackInfo(artist: artist, title: title, source: .manual)
        nowPlaying.setManualTrack(track)
        await playStory(for: track, manual: true)
    }

    func stopStory() {
        cancelGenerationPreview()
        storyFetchTask?.cancel()
        storyFetchTask = nil
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
            let copy = AppStrings.l10n(settings.resolvedLanguage)
            uiState.errorMessage = copy.offlineNoCache
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
                    let copy = AppStrings.l10n(self?.settings.resolvedLanguage ?? .ru)
                    self?.uiState.errorMessage = copy.playbackFailed
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
        if isStoryRunning {
            guard manual else { return }
            stopStory()
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        isStoryRunning = true
        playbackSession += 1
        let session = playbackSession

        uiState.state = .fetchingStory
        uiState.errorMessage = nil
        uiState.currentTrack = track

        let fetchStarted = Date()
        let result = await fetchStoryWithTimeout(for: track)

        guard session == playbackSession else {
            isStoryRunning = false
            return
        }

        switch result {
        case .success(let response):
            markStoryTriggered(for: track)
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

            let displayText = response.displayTranscript
            startGenerationPreview(
                script: displayText,
                session: session,
                isSpokenTranscript: response.ttsTranscript?.isEmpty == false
            )

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
                        self.cancelGenerationPreview()
                        await self.storyRepository.recordStoryPlaybackComplete(response)
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
                        let copy = AppStrings.l10n(self?.settings.resolvedLanguage ?? .ru)
                    self?.uiState.errorMessage = copy.playbackFailed
                        self?.uiState.state = .error
                    }
                }
            )

            schedulePlaybackWatchdog(session: session, musicPaused: musicPaused)

        case .failure(let error):
            cancelGenerationPreview()
            isStoryRunning = false
            if UserFacingError.isBenignStoryCancel(error) {
                uiState.errorMessage = nil
                uiState.state = .listening
                return
            }
            let copy = AppStrings.l10n(settings.resolvedLanguage)
            let mapped = UserFacingError.storyMessage(for: error, lang: settings.resolvedLanguage)
            if mapped.isEmpty {
                uiState.errorMessage = nil
                uiState.state = .listening
                return
            }
            if (error as? URLError)?.code == .timedOut {
                uiState.errorMessage = copy.storyFetchTimeout
            } else {
                uiState.errorMessage = mapped
            }
            uiState.state = .error
        }
    }

    private func fetchStoryWithTimeout(for track: TrackInfo) async -> Result<StoryResponse, Error> {
        storyFetchTask?.cancel()
        let fetchTask = Task { await storyRepository.fetchStory(track: track, forceRefresh: true) }
        storyFetchTask = fetchTask

        let timeoutTask = Task {
            try await Task.sleep(nanoseconds: Self.storyFetchTimeoutNs)
            fetchTask.cancel()
        }

        let repositoryResult = await fetchTask.value
        timeoutTask.cancel()
        storyFetchTask = nil

        switch repositoryResult {
        case .success(let response):
            return .success(response)
        case .failure(let error):
            if fetchTask.isCancelled, !Task.isCancelled {
                let copy = AppStrings.l10n(settings.resolvedLanguage)
                return .failure(URLError(.timedOut, userInfo: [NSLocalizedDescriptionKey: copy.storyFetchTimeout]))
            }
            return .failure(error)
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
            let copy = AppStrings.l10n(settings.resolvedLanguage)
            uiState.errorMessage = copy.playbackRetry
            uiState.state = .error
        }
    }

    private func cancelGenerationPreview() {
        previewTask?.cancel()
        previewTask = nil
        uiState.generationPreview = GenerationPreviewState()
    }

    private func startGenerationPreview(script: String, session: Int, isSpokenTranscript: Bool) {
        let words = script
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split { $0.isWhitespace }
            .map(String.init)
        guard !words.isEmpty else { return }

        previewTask?.cancel()
        previewTask = Task {
            let estimatedMs = max(12_000, words.count * 420)
            let waitStart = Date()

            uiState.generationPreview = GenerationPreviewState(
                words: words,
                visibleWordCount: 0,
                isActive: true,
                isSpokenTranscript: isSpokenTranscript
            )

            var lastCount = 0
            while session == playbackSession {
                let playerState = storyPlayer.state
                let progress = storyPlayer.playbackProgress
                let elapsedMs = Int(Date().timeIntervalSince(waitStart) * 1000)

                let count: Int
                switch playerState {
                case .completed:
                    count = words.count
                case .playing, .paused:
                    count = Self.visibleWordsFromPlayback(
                        wordCount: words.count,
                        progress: progress,
                        elapsedMs: elapsedMs,
                        estimatedDurationMs: estimatedMs
                    )
                default:
                    count = 0
                }

                if count != lastCount {
                    lastCount = count
                    uiState.generationPreview.visibleWordCount = count
                }

                if playerState == .completed { break }
                try? await Task.sleep(nanoseconds: 40_000_000)
            }

            guard session == playbackSession else { return }
            uiState.generationPreview.visibleWordCount = words.count
            uiState.generationPreview.isActive = true
        }
    }

    private static func visibleWordsFromPlayback(
        wordCount: Int,
        progress: Double,
        elapsedMs: Int,
        estimatedDurationMs: Int
    ) -> Int {
        if progress > 0.01 {
            return min(wordCount, max(1, Int((Double(wordCount) * progress).rounded(.up))))
        }
        let fraction = min(1, Double(elapsedMs) / Double(max(estimatedDurationMs, 1)))
        return min(wordCount, max(0, Int((Double(wordCount) * fraction).rounded(.up))))
    }
}
