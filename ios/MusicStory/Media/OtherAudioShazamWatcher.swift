import AVFoundation
import Foundation

/// When Spotify / Apple Music are not the active source, detects other apps playing audio
/// and runs short Shazam bursts (not continuous mic) — similar spirit to Android auto mode.
@MainActor
final class OtherAudioShazamWatcher {
    private var task: Task<Void, Never>?
    private var lastAttempt = Date.distantPast
    private var lastRecognizedKey: String?

    private let pollIntervalNs: UInt64 = 2_000_000_000
    private let recognizeCooldown: TimeInterval = 50

    func start(nowPlaying: NowPlayingCoordinator, settings: SettingsStore) {
        task?.cancel()
        task = Task { [weak nowPlaying, weak settings] in
            var wasOtherAudioPlaying = false
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: self.pollIntervalNs)
                guard let nowPlaying, let settings else { return }
                guard settings.shazamAutoDetectEnabled else { continue }

                let otherAudio = AVAudioSession.sharedInstance().isOtherAudioPlaying
                if usesIntegratedPlayer(nowPlaying) {
                    wasOtherAudioPlaying = otherAudio
                    continue
                }

                guard otherAudio else {
                    wasOtherAudioPlaying = false
                    continue
                }

                let risingEdge = !wasOtherAudioPlaying
                let periodicRescan = Date().timeIntervalSince(self.lastAttempt) >= self.recognizeCooldown
                wasOtherAudioPlaying = true

                guard risingEdge || periodicRescan else { continue }
                guard !nowPlaying.shazam.isListening else { continue }

                self.lastAttempt = Date()
                do {
                    let track = try await nowPlaying.recognizeWithShazam()
                    if track.displayKey != self.lastRecognizedKey {
                        self.lastRecognizedKey = track.displayKey
                    }
                } catch {
                    // No match or mic busy — try again on next cooldown / new playback.
                }
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
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
