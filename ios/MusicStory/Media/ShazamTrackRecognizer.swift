import AVFoundation
import ShazamKit

enum ShazamError: LocalizedError {
    case microphonePermissionDenied
    case noMatch
    case engineFailure(String)

    var errorDescription: String? {
        switch self {
        case .microphonePermissionDenied:
            return "Нет доступа к микрофону для распознавания трека"
        case .noMatch:
            return "Не удалось распознать трек"
        case .engineFailure(let message):
            return message
        }
    }
}

@MainActor
final class ShazamTrackRecognizer: ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var lastMatch: TrackInfo?

    private var audioEngine: AVAudioEngine?
    private var session: SHSession?
    private var matchContinuation: CheckedContinuation<TrackInfo, Error>?

    func recognizeOnce(timeout: TimeInterval = 12) async throws -> TrackInfo {
        guard await requestMicrophonePermission() else {
            throw ShazamError.microphonePermissionDenied
        }

        return try await withCheckedThrowingContinuation { continuation in
            matchContinuation = continuation
            startListening()

            Task {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                if self.matchContinuation != nil {
                    self.stopListening()
                    self.matchContinuation?.resume(throwing: ShazamError.noMatch)
                    self.matchContinuation = nil
                }
            }
        }
    }

    func stopListening() {
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
        session = nil
        isListening = false
    }

    private func startListening() {
        stopListening()
        isListening = true

        let session = SHSession()
        session.delegate = ShazamSessionDelegate { [weak self] match in
            Task { @MainActor in
                self?.handleMatch(match)
            }
        }
        self.session = session

        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)

        input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, time in
            session.matchStreamingBuffer(buffer, at: time)
        }

        do {
            try AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers, .defaultToSpeaker])
            try AVAudioSession.sharedInstance().setActive(true)
            try engine.start()
            audioEngine = engine
        } catch {
            stopListening()
            matchContinuation?.resume(throwing: ShazamError.engineFailure(error.localizedDescription))
            matchContinuation = nil
        }
    }

    private func handleMatch(_ match: SHMatch) {
        guard let item = match.mediaItems.first else { return }
        let artist = item.artist ?? "Unknown"
        let title = item.title ?? "Unknown"
        let track = TrackInfo(artist: artist, title: title, album: nil, source: .shazam)
        lastMatch = track
        stopListening()
        matchContinuation?.resume(returning: track)
        matchContinuation = nil
    }

    private func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}

private final class ShazamSessionDelegate: NSObject, SHSessionDelegate {
    private let onMatch: (SHMatch) -> Void

    init(onMatch: @escaping (SHMatch) -> Void) {
        self.onMatch = onMatch
    }

    func session(_ session: SHSession, didFind match: SHMatch) {
        onMatch(match)
    }
}
