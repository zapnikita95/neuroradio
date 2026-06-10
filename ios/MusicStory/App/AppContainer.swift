import SwiftUI

@MainActor
final class AppContainer: ObservableObject {
    static let shared = AppContainer()

    let settings = SettingsStore.shared
    let nowPlaying = NowPlayingCoordinator()
    let storyPlayer = StoryPlayer()
    lazy var orchestrator = StoryOrchestrator(nowPlaying: nowPlaying, storyPlayer: storyPlayer)

    private init() {}

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
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            await StoryRepository.shared.prefetchMissingOfflineAudio()
        }
    }

    func handleOpenURL(_ url: URL) {
        if url.host == "tell-story" || url.path == "/tell-story" {
            Task { await orchestrator.requestManualStory() }
            return
        }
        nowPlaying.spotify.handleOpenURL(url)
    }
}
