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

    private var player: AVPlayer?
    private var playerObserver: NSKeyValueObservation?
    private var endObserver: NSObjectProtocol?
    private let synthesizer = AVSpeechSynthesizer()
    private var resumeMusicOnFinish = true
    private var onFinished: (() -> Void)?
    private var onError: (() -> Void)?
    private var onPlaybackStarted: (() -> Void)?
    private var playbackStartedNotified = false

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
        currentScript = response.script

        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)

        if let audioURL {
            playRemoteAudio(url: audioURL, fallbackScript: response.script, speechRate: speechRate)
        } else {
            playWithTTS(response.script, speechRate: speechRate)
        }
    }

    func shouldResumeMusic() -> Bool { resumeMusicOnFinish }

    func stop() {
        stopInternal(clearCallbacks: true)
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

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.finishPlayback()
            }
        }

        avPlayer.play()

        Task {
            try? await Task.sleep(nanoseconds: 15_000_000_000)
            await MainActor.run {
                guard self.state == .preparing || (self.state == .playing && !self.playbackStartedNotified) else { return }
                self.cleanupPlayer()
                self.playWithTTS(fallbackScript, speechRate: speechRate)
            }
        }
    }

    private func playWithTTS(_ script: String, speechRate: Float) {
        state = .preparing
        let utterance = AVSpeechUtterance(string: script)
        utterance.voice = AVSpeechSynthesisVoice(language: "ru-RU")
        utterance.rate = speechRate
        utterance.pitchMultiplier = 0.98
        synthesizer.speak(utterance)
    }

    private func finishPlayback() {
        cleanupPlayer()
        state = .completed
        onFinished?()
        clearCallbacks()
    }

    private func failPlayback() {
        cleanupPlayer()
        synthesizer.stopSpeaking(at: .immediate)
        state = .error
        onError?()
        clearCallbacks()
    }

    private func notifyPlaybackStarted() {
        guard !playbackStartedNotified else { return }
        playbackStartedNotified = true
        onPlaybackStarted?()
        onPlaybackStarted = nil
    }

    private func stopInternal(clearCallbacks: Bool) {
        cleanupPlayer()
        synthesizer.stopSpeaking(at: .immediate)
        state = .idle
        currentScript = nil
        playbackStartedNotified = false
        if clearCallbacks { clearCallbacksStorage() }
    }

    private func cleanupPlayer() {
        player?.pause()
        playerObserver?.invalidate()
        playerObserver = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
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
