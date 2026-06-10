import SwiftUI

@MainActor
final class AppContainer: ObservableObject {
    static let shared = AppContainer()

    let settings = SettingsStore.shared
    let nowPlaying = NowPlayingCoordinator()
    let storyPlayer = StoryPlayer()
    lazy var orchestrator = StoryOrchestrator(nowPlaying: nowPlaying, storyPlayer: storyPlayer)

    private init() {
        nowPlaying.prepareSpotify(settings: settings)
    }

    func bootstrap() {
        NotificationService.shared.configure()
        NotificationService.shared.onTellStoryAction = { [weak self] artist, title in
            Task { @MainActor in
                await self?.orchestrator.requestStoryFromNotification(artist: artist, title: title)
            }
        }

        nowPlaying.start(settings: settings)
        orchestrator.startMonitoring()

        Task {
            await BackendClient.shared.warmUp()
            await StoryRepository.shared.refreshQuota()
        }
    }

    func handleOpenURL(_ url: URL) {
        if url.host == "tell-story" || url.path == "/tell-story" {
            Task { await orchestrator.requestManualStory() }
            return
        }
        if url.scheme?.lowercased() == "efirai",
           url.host?.lowercased() == "spotify-callback" || url.path.lowercased().contains("spotify-callback") {
            nowPlaying.spotify.handleOpenURL(url)
        }
    }
}
