import SwiftUI

@main
struct MusicStoryApp: App {
    @StateObject private var container = AppContainer.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(container)
                .environmentObject(container.settings)
                .environmentObject(container.orchestrator)
                .environmentObject(container.nowPlaying)
                .onOpenURL { url in
                    container.handleOpenURL(url)
                }
                .task {
                    container.bootstrap()
                }
        }
    }
}

struct RootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    var body: some View {
        NavigationStack {
            if settings.onboardingComplete {
                HomeView()
            } else {
                OnboardingView()
            }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                nowPlaying.prepareSpotify(settings: settings)
                nowPlaying.spotify.attemptSilentReconnect()
            }
        }
    }
}

