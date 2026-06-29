import AVFoundation
import Foundation

/// Auto-Shazam when other apps play audio. Pauses between attempts for the recognized track length.
@MainActor
final class OtherAudioShazamWatcher {
    private var task: Task<Void, Never>?
    private var policy = ShazamAutoPolicy()
    private var lastRecognizedKey: String?

    private let pollIntervalNs: UInt64 = 2_500_000_000

    func start(nowPlaying: NowPlayingCoordinator, settings: SettingsStore) {
        task?.cancel()
        task = Task { [weak nowPlaying, weak settings] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: self.pollIntervalNs)
                guard let nowPlaying, let settings else { return }
                guard settings.shazamAutoDetectEnabled else { continue }
                guard !nowPlaying.shazam.isListening else { continue }

                let otherAudio = AVAudioSession.sharedInstance().isOtherAudioPlaying
                let integrated = self.usesIntegratedPlayer(nowPlaying)

                guard self.policy.shouldAttempt(
                    otherAudioPlaying: otherAudio,
                    integratedPlayerActive: integrated
                ) else {
                    continue
                }

                do {
                    let track = try await nowPlaying.recognizeWithShazam(autoTriggered: true)
                    guard track.isValid() else {
                        self.policy.recordFailure()
                        continue
                    }
                    self.policy.recordSuccess(track)
                    if track.displayKey != self.lastRecognizedKey {
                        self.lastRecognizedKey = track.displayKey
                    }
                } catch {
                    self.policy.recordFailure()
                }
            }
        }
    }

    func recordManualSuccess(_ track: TrackInfo) {
        policy.recordSuccess(track)
        lastRecognizedKey = track.displayKey
    }

    func recordManualFailure() {
        policy.recordFailure()
    }

    func stop() {
        task?.cancel()
        task = nil
        policy.mediaDidStop()
    }

    private func usesIntegratedPlayer(_ nowPlaying: NowPlayingCoordinator) -> Bool {
        if nowPlaying.spotify.isPlaying, nowPlaying.currentTrack?.source == .spotify {
            return true
        }
        if nowPlaying.appleMusic.isPlaying, nowPlaying.currentTrack?.source == .appleMusic {
            return true
        }
        return false
    }
}
