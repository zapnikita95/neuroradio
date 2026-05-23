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
        .modelContainer(StoryHistoryStore.modelContainer)
    }
}

struct RootView: View {
    @EnvironmentObject private var settings: SettingsStore

    var body: some View {
        if settings.onboardingComplete {
            MainTabView()
        } else {
            OnboardingView()
        }
    }
}

struct MainTabView: View {
    var body: some View {
        NavigationStack {
            HomeView()
        }
    }
}
