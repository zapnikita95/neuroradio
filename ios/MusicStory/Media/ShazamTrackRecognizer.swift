import AVFoundation
import ShazamKit

enum ShazamError: LocalizedError {
    case microphonePermissionDenied
    case noMatch
    case engineFailure

    var errorDescription: String? {
        switch self {
        case .microphonePermissionDenied:
            return AppStrings.Shazam.micDenied
        case .noMatch:
            return AppStrings.Shazam.noMatch
        case .engineFailure:
            return AppStrings.Shazam.engineFailure
        }
    }
}

@MainActor
final class ShazamTrackRecognizer: ObservableObject {
    @Published private(set) var isListening = false
    @Published private(set) var lastMatch: TrackInfo?

    private var activeSession: SHManagedSession?
    private var recognizeTask: Task<TrackInfo, Error>?

    func recognizeOnce(timeout: TimeInterval = 12) async throws -> TrackInfo {
        recognizeTask?.cancel()
        stopListening()

        guard await requestMicrophonePermission() else {
            throw ShazamError.microphonePermissionDenied
        }

        isListening = true
        defer {
            isListening = false
            activeSession = nil
        }

        let session = SHManagedSession()
        activeSession = session
        await session.prepare()

        return try await withThrowingTaskGroup(of: TrackInfo.self) { group in
            group.addTask {
                switch await session.result() {
                case .match(let match):
                    return try Self.track(from: match)
                case .noMatch:
                    throw ShazamError.noMatch
                case .error(_, _):
                    throw ShazamError.engineFailure
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw ShazamError.noMatch
            }

            guard let track = try await group.next() else {
                throw ShazamError.noMatch
            }
            group.cancelAll()
            self.lastMatch = track
            return track
        }
    }

    func stopListening() {
        recognizeTask?.cancel()
        recognizeTask = nil
        activeSession = nil
        isListening = false
    }

    private static func track(from match: SHMatch) throws -> TrackInfo {
        guard let item = match.mediaItems.first else {
            throw ShazamError.noMatch
        }
        let artist = item.artist?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let title = item.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !artist.isEmpty, !title.isEmpty else {
            throw ShazamError.noMatch
        }
        return TrackInfo(artist: artist, title: title, album: nil, source: .shazam)
    }

    private func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }
}
