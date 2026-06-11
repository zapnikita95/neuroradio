import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var orchestrator: StoryOrchestrator
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator
    @ObservedObject private var storyRepository = StoryRepository.shared
    @ObservedObject private var offlinePack = OfflinePackStore.shared

    @State private var spotifyClientId: String = ""
    @State private var manualArtist: String = ""
    @State private var manualTitle: String = ""

    private var usesEdgeVoices: Bool {
        settings.effectiveServerTtsProvider == .edge
    }

    private var voiceSectionSummary: String {
        let voicePart = usesEdgeVoices
            ? settings.edgeVoicePreset.labelRu
            : settings.ttsVoice.labelRu
        let engine = settings.effectiveServerTtsProvider.labelRu
        return "\(engine) · \(voicePart) · \(settings.ttsSpeedPreset.labelRu) · \(settings.storyLength.labelRu)"
    }

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    generalSection
                    modeSection
                    triggerSection
                    narratorSection
                    voiceSection
                    spotifySection
                    manualSection
                    offlinePackSection
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
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
            spotifyClientId = settings.spotifyClientId
            offlinePack.refreshState()
        }
        .task {
            await StoryRepository.shared.refreshQuota()
            _ = await AccountAuthManager.shared.fetchProfile()
        }
    }

    private var narratorSection: some View {
        SettingsSection(
            title: "Рассказчик (амплуа)",
            summary: settings.storyNarrator.labelRu
        ) {
            ForEach(StoryNarrator.allCases) { narrator in
                SettingsPreferenceRow(
                    label: narrator.labelRu,
                    subtitle: narrator.descriptionRu,
                    selected: settings.storyNarrator == narrator
                ) {
                    settings.storyNarrator = narrator
                }
            }
        }
    }

    private var voiceSection: some View {
        SettingsSection(
            title: "Озвучка",
            summary: voiceSectionSummary
        ) {
            if settings.hasPremiumTtsAccess {
                SettingsSubheading(title: "Движок озвучки")
                ForEach(ServerTtsProvider.allCases) { provider in
                    SettingsPreferenceRow(
                        label: provider.labelRu,
                        subtitle: provider.descriptionRu,
                        selected: settings.serverTtsProvider == provider
                    ) {
                        settings.serverTtsProvider = provider
                    }
                }
            }

            if usesEdgeVoices {
                SettingsSubheading(title: "Голос Microsoft Edge")
                ForEach(EdgeVoicePreset.allCases) { preset in
                    SettingsPreferenceRow(
                        label: preset.labelRu,
                        subtitle: preset.descriptionRu,
                        selected: settings.edgeVoicePreset == preset
                    ) {
                        settings.edgeVoicePreset = preset
                    }
                }
            } else {
                SettingsSubheading(title: "Голос")
                ForEach(TtsVoice.allCases) { voice in
                    SettingsPreferenceRow(
                        label: voice.labelRu,
                        subtitle: voice.descriptionRu,
                        selected: settings.ttsVoice == voice
                    ) {
                        settings.ttsVoice = voice
                    }
                }

                SettingsSubheading(title: "Интонация")
                ForEach(TtsEmotion.allCases) { emotion in
                    SettingsPreferenceRow(
                        label: emotion.labelRu,
                        subtitle: emotion.descriptionRu,
                        selected: settings.ttsEmotion == emotion
                    ) {
                        settings.ttsEmotion = emotion
                    }
                }
            }

            SettingsSubheading(title: "Скорость речи")
            ForEach(TtsSpeed.allCases) { speed in
                SettingsPreferenceRow(
                    label: speed.labelRu,
                    selected: settings.ttsSpeedPreset == speed
                ) {
                    settings.ttsSpeedPreset = speed
                }
            }

            SettingsSubheading(title: "Длина истории")
            ForEach(StoryLength.allCases) { length in
                SettingsPreferenceRow(
                    label: length.labelRu,
                    subtitle: length.descriptionRu,
                    selected: settings.storyLength == length
                ) {
                    settings.storyLength = length
                }
            }
        }
    }

    private var generalSection: some View {
        SettingsSection(
            title: "Общее",
            summary: "Уведомления и Shazam"
        ) {
            Toggle(isOn: $settings.factNotificationsEnabled) {
                Text("Уведомления о фактах")
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.goldBright)

            Toggle(isOn: $settings.shazamAutoDetectEnabled) {
                Text(AppStrings.Shazam.autoDetectTitle)
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.goldBright)

            Toggle(isOn: $settings.speakTrackNamesInVoiceover) {
                Text("Названия треков в озвучке")
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.goldBright)
        }
    }

    private var modeSection: some View {
        SettingsSection(
            title: "Режим",
            summary: settings.manualMode ? "Ручной" : "Авто"
        ) {
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

    @ViewBuilder
    private var offlinePackSection: some View {
        let canUse = TierAccess.canUseOfflineAudioCache(storyRepository.accountTier)
        if canUse {
            let state = offlinePack.uiState
            SettingsSection(
                title: AppStrings.OfflinePack.title,
                summary: offlinePackSummary(state)
            ) {
                switch state.phase {
                case .idle:
                    Text(AppStrings.OfflinePack.intro)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                    Button(AppStrings.OfflinePack.start) {
                        Task { _ = await offlinePack.startCollecting() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.goldBright)
                case .collecting:
                    Text(AppStrings.OfflinePack.collectingHint)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                    Text(AppStrings.OfflinePack.progress(collected: state.collectedCount, target: state.targetCount))
                        .foregroundStyle(AppTheme.goldBright)
                    ForEach(state.entries.indices, id: \.self) { index in
                        let entry = state.entries[index]
                        Text("\(entry.artist) — \(entry.title)")
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                    }
                    Button(AppStrings.OfflinePack.cancel, role: .cancel) {
                        offlinePack.cancelPack()
                    }
                case .generating:
                    Text(AppStrings.OfflinePack.generating(ready: state.readyCount, target: state.targetCount))
                        .foregroundStyle(AppTheme.goldBright)
                    Text(AppStrings.OfflinePack.tracksReadyBody(count: state.targetCount))
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                case .ready:
                    Text(AppStrings.OfflinePack.ready(count: state.readyCount))
                        .foregroundStyle(AppTheme.creamText)
                    Text(AppStrings.OfflinePack.readyHint)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                    HStack {
                        Button(AppStrings.OfflinePack.refresh) {
                            Task { _ = await offlinePack.startCollecting() }
                        }
                        Button(AppStrings.OfflinePack.cancel, role: .cancel) {
                            offlinePack.cancelPack()
                        }
                    }
                }
            }
        }
    }

    private func offlinePackSummary(_ state: OfflinePackUiState) -> String {
        switch state.phase {
        case .idle: return "Подготовить пакет"
        case .collecting:
            return AppStrings.OfflinePack.progress(collected: state.collectedCount, target: state.targetCount)
        case .generating:
            return AppStrings.OfflinePack.generating(ready: state.readyCount, target: state.targetCount)
        case .ready:
            return AppStrings.OfflinePack.ready(count: state.readyCount)
        }
    }

    private var triggerSection: some View {
        SettingsSection(
            title: "Триггер",
            summary: settings.triggerMode.label
        ) {
            ForEach(TriggerMode.allCases) { mode in
                SettingsPreferenceRow(
                    label: mode.label,
                    selected: settings.triggerMode == mode
                ) {
                    settings.triggerMode = mode
                }
            }

            if settings.triggerMode == .everyNTracks {
                Stepper("Каждые N треков: \(settings.everyNTracks)", value: $settings.everyNTracks, in: 1...50)
                    .foregroundStyle(AppTheme.creamText)
            }
        }
    }

    private var spotifySection: some View {
        SettingsSection(
            title: "Spotify",
            summary: nowPlaying.spotify.isConnected ? "Подключён" : "Не подключён"
        ) {
            TextField("Client ID из Spotify Developer Dashboard", text: $spotifyClientId)
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

    private var manualSection: some View {
        SettingsSection(
            title: "Ручной ввод",
            summary: "Яндекс Музыка и другие плееры"
        ) {
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
