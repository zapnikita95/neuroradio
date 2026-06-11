import AVFoundation
import Combine
import Foundation

@MainActor
final class NowPlayingCoordinator: ObservableObject {
    @Published private(set) var currentTrack: TrackInfo?
    @Published private(set) var isPlaying = false
    @Published private(set) var activeSource: TrackSource?

    let spotify = SpotifyAppRemoteManager()
    let appleMusic = AppleMusicNowPlaying()
    let shazam = ShazamTrackRecognizer()

    private var cancellables = Set<AnyCancellable>()
    private var lastPublishedKey: String?
    private let volumeFader = SystemVolumeFader()
    private let otherAudioWatcher = OtherAudioShazamWatcher()
    var onTrackChanged: ((TrackInfo) -> Void)?

    func prepareSpotify(settings: SettingsStore) {
        spotify.configure(
            clientId: settings.effectiveSpotifyClientId,
            redirectURI: settings.effectiveSpotifyRedirectURI
        )
    }

    func start(settings: SettingsStore) {
        prepareSpotify(settings: settings)
        spotify.start()
        appleMusic.start()

        spotify.$currentTrack
            .combineLatest(spotify.$isPlaying, appleMusic.$currentTrack, appleMusic.$isPlaying)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] spotifyTrack, spotifyPlaying, appleTrack, applePlaying in
                self?.merge(spotifyTrack: spotifyTrack, spotifyPlaying: spotifyPlaying, appleTrack: appleTrack, applePlaying: applePlaying)
            }
            .store(in: &cancellables)

        otherAudioWatcher.start(nowPlaying: self, settings: settings)
    }

    func stop() {
        otherAudioWatcher.stop()
        cancellables.removeAll()
        appleMusic.stop()
    }

    func pauseMusic() {
        switch activeSource {
        case .spotify:
            spotify.pauseMusic()
        case .appleMusic:
            appleMusic.pauseMusic()
        default:
            break
        }
    }

    func fadeOutAndPause(seconds: Float) async {
        guard canControlPlayback(for: activeSource) else { return }
        await volumeFader.fadeOut(duration: TimeInterval(seconds))
        pauseMusic()
    }

    func resumeMusicWithFade(seconds: Float) async {
        resumeMusic()
        await volumeFader.fadeIn(duration: TimeInterval(seconds))
    }

    func restoreVolumeIfNeeded() async {
        await volumeFader.restoreIfNeeded()
    }

    func resumeMusic() {
        switch activeSource {
        case .spotify:
            spotify.resumeMusic()
        case .appleMusic:
            appleMusic.resumeMusic()
        default:
            break
        }
    }

    func canControlPlayback(for source: TrackSource?) -> Bool {
        switch source {
        case .spotify:
            return spotify.canControlPlayback
        case .appleMusic:
            return appleMusic.canControlPlayback
        default:
            return false
        }
    }

    func setManualTrack(_ track: TrackInfo) {
        publish(track: track)
    }

    func recognizeWithShazam() async throws -> TrackInfo {
        let track = try await shazam.recognizeOnce()
        let playing = AVAudioSession.sharedInstance().isOtherAudioPlaying
            || spotify.isPlaying
            || appleMusic.isPlaying
        publish(track: track, isPlaying: playing)
        return track
    }

    private func merge(
        spotifyTrack: TrackInfo?,
        spotifyPlaying: Bool,
        appleTrack: TrackInfo?,
        applePlaying: Bool
    ) {
        if let spotifyTrack, spotifyPlaying || spotifyTrack.isValid() {
            publish(track: spotifyTrack, isPlaying: spotifyPlaying)
            return
        }
        if let appleTrack, applePlaying || appleTrack.isValid() {
            publish(track: appleTrack, isPlaying: applePlaying)
            return
        }
        if let spotifyTrack, spotifyTrack.isValid() {
            publish(track: spotifyTrack, isPlaying: spotifyPlaying)
            return
        }
        if let appleTrack, appleTrack.isValid() {
            publish(track: appleTrack, isPlaying: applePlaying)
            return
        }
        if let existing = currentTrack,
           existing.isValid(),
           existing.source == .shazam || existing.source == .manual,
           AVAudioSession.sharedInstance().isOtherAudioPlaying {
            isPlaying = true
            return
        }
        currentTrack = nil
        isPlaying = false
        activeSource = nil
    }

    private func publish(track: TrackInfo, isPlaying: Bool? = nil) {
        let playing = isPlaying ?? (track.source == .spotify ? spotify.isPlaying : appleMusic.isPlaying)
        currentTrack = track
        self.isPlaying = playing
        activeSource = track.source

        let key = track.displayKey
        guard key != lastPublishedKey else { return }
        lastPublishedKey = key
        onTrackChanged?(track)
    }
}
