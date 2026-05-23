import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var orchestrator: StoryOrchestrator
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var backendURL: String = ""
    @State private var spotifyClientId: String = ""
    @State private var manualArtist: String = ""
    @State private var manualTitle: String = ""

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    backendSection
                    modeSection
                    triggerSection
                    spotifySection
                    manualSection
                }
                .padding()
            }
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .foregroundStyle(AppTheme.goldBright)
                }
            }
            ToolbarItem(placement: .principal) {
                Text("Настройки")
                    .foregroundStyle(AppTheme.creamText)
            }
        }
        .onAppear {
            backendURL = settings.backendURL
            spotifyClientId = settings.spotifyClientId
        }
    }

    private var header: some View {
        Text("Подключение и триггеры")
            .font(.title2.bold())
            .foregroundStyle(AppTheme.creamText)
    }

    private var backendSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("URL бэкенда")
                    .foregroundStyle(AppTheme.mutedLavender)
                TextField("http://192.168.0.10:3000", text: $backendURL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .foregroundStyle(AppTheme.creamText)
                    .onChange(of: backendURL) { _, newValue in
                        settings.backendURL = newValue
                    }
            }
        }
    }

    private var modeSection: some View {
        GlassCard {
            Toggle(isOn: Binding(
                get: { settings.manualMode },
                set: {
                    settings.manualMode = $0
                    orchestrator.syncModeFromSettings()
                }
            )) {
                Text("Ручной режим")
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.goldBright)
        }
    }

    private var triggerSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Триггер")
                    .foregroundStyle(AppTheme.mutedLavender)
                Picker("Режим", selection: $settings.triggerMode) {
                    ForEach(TriggerMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.menu)
                .tint(AppTheme.goldBright)

                Stepper("Каждые N треков: \(settings.everyNTracks)", value: $settings.everyNTracks, in: 1...50)
                    .foregroundStyle(AppTheme.creamText)
            }
        }
    }

    private var spotifySection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Spotify Client ID")
                    .foregroundStyle(AppTheme.mutedLavender)
                TextField("из Spotify Developer Dashboard", text: $spotifyClientId)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .foregroundStyle(AppTheme.creamText)
                    .onChange(of: spotifyClientId) { _, newValue in
                        settings.spotifyClientId = newValue
                        nowPlaying.spotify.configure(
                            clientId: newValue,
                            redirectURI: settings.spotifyRedirectURI
                        )
                    }

                if let error = nowPlaying.spotify.connectionError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(AppTheme.errorCoral)
                }

                PrimaryStoryButton(title: "Подключить Spotify") {
                    nowPlaying.spotify.connect()
                }
            }
        }
    }

    private var manualSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Ручной ввод (Яндекс Музыка и др.)")
                    .foregroundStyle(AppTheme.mutedLavender)
                TextField("Артист", text: $manualArtist)
                    .foregroundStyle(AppTheme.creamText)
                TextField("Название", text: $manualTitle)
                    .foregroundStyle(AppTheme.creamText)
                PrimaryStoryButton(title: "История для этого трека") {
                    Task {
                        await orchestrator.requestManualStory(artist: manualArtist, title: manualTitle)
                    }
                }
            }
        }
    }
}
