import AVFoundation
import Combine

enum StoryPlaybackState {
    case idle
    case preparing
    case playing
    case paused
    case completed
    case error
}

@MainActor
final class StoryPlayer: NSObject, ObservableObject {
    @Published private(set) var state: StoryPlaybackState = .idle
    @Published private(set) var currentScript: String?
    @Published private(set) var playbackProgress: Double = 0

    private var player: AVPlayer?
    private var playerObserver: NSKeyValueObservation?
    private var itemStatusObserver: NSKeyValueObservation?
    private var timeObserver: Any?
    private var endObserver: NSObjectProtocol?
    private var failObserver: NSObjectProtocol?
    private let synthesizer = AVSpeechSynthesizer()
    private var resumeMusicOnFinish = true
    private var onFinished: (() -> Void)?
    private var onError: (() -> Void)?
    private var onPlaybackStarted: (() -> Void)?
    private var playbackStartedNotified = false
    private var fallbackTask: Task<Void, Never>?
    private var ttsProgressTask: Task<Void, Never>?
    private var estimatedDurationMs: Int = 0
    private var playbackStartedAt: Date?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func playStory(
        response: StoryResponse,
        audioURL: URL?,
        speechRate: Float = 0.92,
        resumeMusic: Bool = true,
        onPlaybackStarted: (() -> Void)? = nil,
        onFinished: (() -> Void)? = nil,
        onError: (() -> Void)? = nil
    ) {
        stopInternal(clearCallbacks: false)
        resumeMusicOnFinish = resumeMusic
        self.onFinished = onFinished
        self.onError = onError
        self.onPlaybackStarted = onPlaybackStarted
        playbackStartedNotified = false
        playbackProgress = 0
        currentScript = response.displayTranscript
        estimatedDurationMs = Self.estimateDurationMs(wordCount: response.wordCount, script: currentScript ?? response.script)

        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)

        if let audioURL, Self.canPlayWithAVPlayer(url: audioURL) {
            playRemoteAudio(url: audioURL, fallbackScript: response.script, speechRate: speechRate)
        } else {
            playWithTTS(response.script, speechRate: speechRate)
        }
    }

    func shouldResumeMusic() -> Bool { resumeMusicOnFinish }

    func stop() {
        stopInternal(clearCallbacks: true)
    }

    private static func canPlayWithAVPlayer(url: URL) -> Bool {
        let ext = url.pathExtension.lowercased()
        return ext != "ogg" && ext != "opus"
    }

    private func playRemoteAudio(url: URL, fallbackScript: String, speechRate: Float) {
        state = .preparing
        let item = AVPlayerItem(url: url)
        let avPlayer = AVPlayer(playerItem: item)
        player = avPlayer

        playerObserver = avPlayer.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
            Task { @MainActor in
                guard let self else { return }
                switch player.timeControlStatus {
                case .playing:
                    self.notifyPlaybackStarted()
                    self.state = .playing
                case .waitingToPlayAtSpecifiedRate:
                    self.state = .preparing
                case .paused:
                    if self.state == .playing { self.state = .paused }
                @unknown default:
                    break
                }
            }
        }

        itemStatusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                guard let self else { return }
                if item.status == .failed {
                    self.fallbackToTTS(fallbackScript, speechRate: speechRate)
                }
            }
        }

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.finishPlayback()
            }
        }

        failObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.fallbackToTTS(fallbackScript, speechRate: speechRate)
            }
        }

        avPlayer.play()

        let interval = CMTime(seconds: 0.04, preferredTimescale: 600)
        timeObserver = avPlayer.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                guard let self, let item = self.player?.currentItem else { return }
                let duration = item.duration.seconds
                guard duration.isFinite, duration > 0.1 else { return }
                self.playbackProgress = min(1, max(0, time.seconds / duration))
            }
        }

        fallbackTask = Task {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            await MainActor.run {
                guard self.state == .preparing || (self.state == .playing && !self.playbackStartedNotified) else { return }
                self.fallbackToTTS(fallbackScript, speechRate: speechRate)
            }
        }
    }

    private func fallbackToTTS(_ script: String, speechRate: Float) {
        fallbackTask?.cancel()
        fallbackTask = nil
        cleanupPlayer()
        playWithTTS(script, speechRate: speechRate)
    }

    private func playWithTTS(_ script: String, speechRate: Float) {
        state = .preparing
        playbackStartedAt = nil
        let utterance = AVSpeechUtterance(string: script)
        utterance.voice = AVSpeechSynthesisVoice(language: "ru-RU")
        utterance.rate = speechRate
        utterance.pitchMultiplier = 0.98
        synthesizer.speak(utterance)
        startTtsProgressSimulation()
    }

    private func startTtsProgressSimulation() {
        ttsProgressTask?.cancel()
        ttsProgressTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 40_000_000)
                guard state == .playing || state == .preparing else { continue }
                let started = playbackStartedAt ?? Date()
                if playbackStartedAt == nil { playbackStartedAt = started }
                let elapsed = Date().timeIntervalSince(started) * 1000
                let duration = max(Double(estimatedDurationMs), 1)
                playbackProgress = min(1, elapsed / duration)
            }
        }
    }

    private static func estimateDurationMs(wordCount: Int, script: String) -> Int {
        let words = max(wordCount, script.split { $0.isWhitespace }.count)
        return max(12_000, words * 420)
    }

    private func finishPlayback() {
        fallbackTask?.cancel()
        fallbackTask = nil
        cleanupPlayer()
        state = .completed
        onFinished?()
        clearCallbacks()
    }

    private func failPlayback() {
        fallbackTask?.cancel()
        fallbackTask = nil
        cleanupPlayer()
        synthesizer.stopSpeaking(at: .immediate)
        state = .error
        onError?()
        clearCallbacks()
    }

    private func notifyPlaybackStarted() {
        guard !playbackStartedNotified else { return }
        playbackStartedNotified = true
        fallbackTask?.cancel()
        fallbackTask = nil
        onPlaybackStarted?()
        onPlaybackStarted = nil
    }

    private func stopInternal(clearCallbacks: Bool) {
        fallbackTask?.cancel()
        fallbackTask = nil
        ttsProgressTask?.cancel()
        ttsProgressTask = nil
        cleanupPlayer()
        synthesizer.stopSpeaking(at: .immediate)
        state = .idle
        currentScript = nil
        playbackProgress = 0
        playbackStartedNotified = false
        playbackStartedAt = nil
        if clearCallbacks { clearCallbacksStorage() }
    }

    private func cleanupPlayer() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
        player?.pause()
        playerObserver?.invalidate()
        playerObserver = nil
        itemStatusObserver?.invalidate()
        itemStatusObserver = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        if let failObserver { NotificationCenter.default.removeObserver(failObserver) }
        failObserver = nil
        player = nil
    }

    private func clearCallbacks() {
        onFinished = nil
        onError = nil
        onPlaybackStarted = nil
    }

    private func clearCallbacksStorage() {
        clearCallbacks()
    }
}

extension StoryPlayer: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        Task { @MainActor in
            notifyPlaybackStarted()
            state = .playing
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            finishPlayback()
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            if state == .playing || state == .preparing {
                state = .idle
            }
        }
    }
}
