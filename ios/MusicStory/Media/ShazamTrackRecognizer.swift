import AVFoundation
import ShazamKit

enum ShazamError: LocalizedError {
    case microphonePermissionDenied
    case noMatch
    case engineFailure

    var errorDescription: String? {
        switch self {
        case .microphonePermissionDenied:
            return "Нужен доступ к микрофону. Настройки → Эфир AI → Микрофон."
        case .noMatch:
            return "Трек не распознан. Поднесите телефон к колонке и включите музыку погромче."
        case .engineFailure:
            return "Микрофон занят. Остановите запись в других приложениях и попробуйте снова."
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
    private var timeoutTask: Task<Void, Never>?

    func recognizeOnce(timeout: TimeInterval = 12) async throws -> TrackInfo {
        guard await requestMicrophonePermission() else {
            throw ShazamError.microphonePermissionDenied
        }

        return try await withCheckedThrowingContinuation { continuation in
            matchContinuation = continuation
            do {
                try startListening()
            } catch {
                matchContinuation = nil
                continuation.resume(throwing: mapEngineError(error))
                return
            }

            timeoutTask?.cancel()
            timeoutTask = Task {
                try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                guard !Task.isCancelled, self.matchContinuation != nil else { return }
                self.stopListening()
                self.matchContinuation?.resume(throwing: ShazamError.noMatch)
                self.matchContinuation = nil
            }
        }
    }

    func stopListening() {
        timeoutTask?.cancel()
        timeoutTask = nil
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
        session = nil
        isListening = false
    }

    private func startListening() throws {
        stopListening()
        isListening = true

        let shazamSession = SHSession()
        shazamSession.delegate = ShazamSessionDelegate { [weak self] match in
            Task { @MainActor in
                self?.handleMatch(match)
            }
        }
        session = shazamSession

        let engine = AVAudioEngine()
        let input = engine.inputNode
        let tapFormat = recordingFormat(for: input)

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(
            .playAndRecord,
            mode: .measurement,
            options: [.mixWithOthers, .defaultToSpeaker, .allowBluetooth]
        )
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        input.installTap(onBus: 0, bufferSize: 4096, format: tapFormat) { buffer, time in
            shazamSession.matchStreamingBuffer(buffer, at: time)
        }

        engine.prepare()
        try engine.start()
        audioEngine = engine
    }

    private func recordingFormat(for input: AVAudioInputNode) -> AVAudioFormat {
        let inputFormat = input.inputFormat(forBus: 0)
        if inputFormat.sampleRate > 0, inputFormat.channelCount > 0 {
            return inputFormat
        }
        let outputFormat = input.outputFormat(forBus: 0)
        if outputFormat.sampleRate > 0, outputFormat.channelCount > 0 {
            return outputFormat
        }
        return AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 44_100,
            channels: 1,
            interleaved: false
        ) ?? outputFormat
    }

    private func mapEngineError(_ error: Error) -> Error {
        let ns = error as NSError
        if ns.domain.contains("coreaudio") || ns.domain == "com.apple.coreaudio.avfaudio" {
            return ShazamError.engineFailure
        }
        return ShazamError.engineFailure
    }

    private func handleMatch(_ match: SHMatch) {
        guard let item = match.mediaItems.first else { return }
        let artist = item.artist?.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = item.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let artist, !artist.isEmpty, let title, !title.isEmpty else { return }

        let track = TrackInfo(artist: artist, title: title, album: nil, source: .shazam)
        lastMatch = track
        stopListening()
        matchContinuation?.resume(returning: track)
        matchContinuation = nil
    }

    private func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
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
