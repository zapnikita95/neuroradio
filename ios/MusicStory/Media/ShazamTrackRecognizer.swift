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
    @Published private(set) var usesHeadphonesRoute = false

    private var activeSession: SHManagedSession?

    func recognizeOnce(timeout: TimeInterval = 12) async throws -> TrackInfo {
        stopListening()

        guard await requestMicrophonePermission() else {
            throw ShazamError.microphonePermissionDenied
        }

        isListening = true
        defer {
            isListening = false
            activeSession = nil
            usesHeadphonesRoute = false
        }

        try configureAudioSessionForShazam()
        usesHeadphonesRoute = isHeadphoneRouteActive()

        let session = SHManagedSession()
        activeSession = session
        await session.prepare()

        var track = try await withThrowingTaskGroup(of: TrackInfo.self) { group in
            group.addTask {
                switch await session.result() {
                case .match(let match):
                    return try await Self.track(from: match)
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
            return track
        }

        let durationMs = await TrackDurationResolver.resolveDurationMs(
            artist: track.artist,
            title: track.title
        )
        if durationMs > 0 {
            track = TrackInfo(
                artist: track.artist,
                title: track.title,
                album: track.album,
                source: track.source,
                durationMs: durationMs
            )
        }

        lastMatch = track
        return track
    }

    func stopListening() {
        activeSession = nil
        isListening = false
    }

    private func configureAudioSessionForShazam() throws {
        let audioSession = AVAudioSession.sharedInstance()
        var options: AVAudioSession.CategoryOptions = [.mixWithOthers, .allowBluetooth, .allowBluetoothA2DP]
        if isHeadphoneRouteActive() {
            options.insert(.defaultToSpeaker)
        }
        try audioSession.setCategory(.playAndRecord, mode: .measurement, options: options)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private func isHeadphoneRouteActive() -> Bool {
        AVAudioSession.sharedInstance().currentRoute.outputs.contains { output in
            switch output.portType {
            case .headphones, .bluetoothA2DP, .bluetoothLE, .bluetoothHFP:
                return true
            default:
                return false
            }
        }
    }

    private static func track(from match: SHMatch) async throws -> TrackInfo {
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
