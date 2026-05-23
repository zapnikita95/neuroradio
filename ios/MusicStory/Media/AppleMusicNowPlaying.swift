import Foundation
import MediaPlayer

@MainActor
final class AppleMusicNowPlaying: ObservableObject {
    @Published private(set) var currentTrack: TrackInfo?
    @Published private(set) var isPlaying = false

    private let player = MPMusicPlayerController.systemMusicPlayer
    private var observers: [NSObjectProtocol] = []

    func start() {
        player.beginGeneratingPlaybackNotifications()
        observers.append(
            NotificationCenter.default.addObserver(
                forName: .MPMusicPlayerControllerNowPlayingItemDidChange,
                object: player,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.refresh() }
            }
        )
        observers.append(
            NotificationCenter.default.addObserver(
                forName: .MPMusicPlayerControllerPlaybackStateDidChange,
                object: player,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.refresh() }
            }
        )
        refresh()
    }

    func stop() {
        player.endGeneratingPlaybackNotifications()
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
    }

    func refresh() {
        isPlaying = player.playbackState == .playing

        guard let item = player.nowPlayingItem else {
            if player.playbackState != .playing {
                currentTrack = nil
            }
            return
        }

        let artist = item.artist ?? item.albumArtist ?? ""
        let title = item.title ?? ""
        guard !artist.isEmpty, !title.isEmpty else {
            currentTrack = nil
            return
        }

        currentTrack = TrackInfo(
            artist: artist,
            title: title,
            album: item.albumTitle,
            source: .appleMusic,
            durationMs: Int64(item.playbackDuration * 1000)
        )
    }

    func pauseMusic() {
        player.pause()
        isPlaying = false
    }

    func resumeMusic() {
        player.play()
        isPlaying = true
    }

    var canControlPlayback: Bool { true }
}
