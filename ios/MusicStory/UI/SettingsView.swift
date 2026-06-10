import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var orchestrator: StoryOrchestrator
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator
    @ObservedObject private var storyRepository = StoryRepository.shared
    @ObservedObject private var offlinePack = OfflinePackStore.shared

    @State private var backendURL: String = ""
    @State private var spotifyClientId: String = ""
    @State private var manualArtist: String = ""
    @State private var manualTitle: String = ""

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    generalSection
                    backendSection
                    modeSection
                    offlineCacheSection
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
            offlinePack.refreshState()
        }
    }

    private var header: some View {
        Text("Подключение и триггеры")
            .font(.title2.bold())
            .foregroundStyle(AppTheme.creamText)
    }

    private var generalSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Общее")
                    .font(.headline)
                    .foregroundStyle(AppTheme.creamText)
                Toggle(isOn: $settings.factNotificationsEnabled) {
                    Text("Уведомления о фактах")
                        .foregroundStyle(AppTheme.creamText)
                }
                .tint(AppTheme.goldBright)
                Text("В ручном режиме — подсказка, если по треку есть интересный факт.")
                    .font(.footnote)
                    .foregroundStyle(AppTheme.mutedLavender)
            }
        }
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

    private var offlineCacheSection: some View {
        let canUse = TierAccess.canUseOfflineAudioCache(storyRepository.accountTier)
        let state = offlinePack.uiState
        return GlassCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Офлайн-эфир")
                    .font(.headline)
                    .foregroundStyle(AppTheme.creamText)

                if !canUse {
                    Text("Доступно по расширенной подписке.")
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedLavender)
                } else {
                    switch state.phase {
                    case .idle:
                        Text("Соберите 10 разных треков — приложение подготовит для них истории заранее. Потом можно слушать без интернета.")
                            .font(.footnote)
                            .foregroundStyle(AppTheme.mutedLavender)
                        Button("Подготовить офлайн-эфир") {
                            Task { _ = await offlinePack.startCollecting() }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppTheme.goldBright)
                    case .collecting:
                        Text("Включите shuffle или перематывайте треки в плеере. Каждый новый трек добавляется в пакет.")
                            .font(.footnote)
                            .foregroundStyle(AppTheme.mutedLavender)
                        Text("Собрано \(state.collectedCount) из \(state.targetCount)")
                            .foregroundStyle(AppTheme.goldBright)
                        ForEach(state.entries.indices, id: \.self) { index in
                            let entry = state.entries[index]
                            Text("\(entry.artist) — \(entry.title)")
                                .font(.caption)
                                .foregroundStyle(AppTheme.mutedLavender)
                        }
                        Button("Отменить", role: .cancel) {
                            offlinePack.cancelPack()
                        }
                    case .generating:
                        Text("Готовим истории и факты… \(state.readyCount) из \(state.targetCount)")
                            .foregroundStyle(AppTheme.goldBright)
                        Text("Пришлём уведомление, когда всё будет готово.")
                            .font(.footnote)
                            .foregroundStyle(AppTheme.mutedLavender)
                    case .ready:
                        Text("Готово! \(state.readyCount) историй на телефоне — можно слушать без сети.")
                            .foregroundStyle(AppTheme.creamText)
                        Text("Когда играет трек из пакета, Эфир расскажет сохранённую историю офлайн.")
                            .font(.footnote)
                            .foregroundStyle(AppTheme.mutedLavender)
                        HStack {
                            Button("Собрать новый пакет") {
                                Task { _ = await offlinePack.startCollecting() }
                            }
                            Button("Отменить", role: .cancel) {
                                offlinePack.cancelPack()
                            }
                        }
                    }
                }
            }
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
