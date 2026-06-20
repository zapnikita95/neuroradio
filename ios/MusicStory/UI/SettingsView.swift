import SwiftUI
import UIKit

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

    @State private var manualStoryLoading = false

    private var lang: ResolvedAppLanguage { settings.resolvedLanguage }
    private var copy: AppL10n { AppStrings.l10n(lang) }

    private var usesEdgeVoices: Bool {
        settings.effectiveServerTtsProvider == .edge
    }

    private var usesElevenLabsVoices: Bool {
        settings.resolvedLanguage == .en && settings.effectiveServerTtsProvider == .elevenlabs
    }

    private var voiceSectionSummary: String {
        let voicePart: String = if usesElevenLabsVoices {
            settings.elevenLabsVoice.uiLabel(lang)
        } else if usesEdgeVoices {
            settings.edgeVoicePreset.uiLabel(lang)
        } else {
            settings.ttsVoice.uiLabel(lang)
        }
        let engine = settings.effectiveServerTtsProvider.uiLabel(lang)
        return "\(engine) · \(voicePart) · \(settings.ttsSpeedPreset.uiLabel(lang)) · \(settings.storyLength.uiLabel(lang))"
    }

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    languageSection
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
                Text(copy.settingsTitle)
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

    private var languageSection: some View {
        SettingsSection(
            title: copy.languageSection,
            summary: languageSummary
        ) {
            languageRow(.system, copy.languageSystem)
            languageRow(.ru, copy.languageRu)
            languageRow(.en, copy.languageEn)
        }
    }

    private var languageSummary: String {
        switch settings.appLanguage {
        case .system: return copy.languageSystem
        case .ru: return copy.languageRu
        case .en: return copy.languageEn
        }
    }

    private func languageRow(_ value: AppLanguage, _ label: String) -> some View {
        SettingsPreferenceRow(
            label: label,
            selected: settings.appLanguage == value
        ) {
            settings.appLanguage = value
        }
    }

    private var narratorSection: some View {
        SettingsSection(
            title: copy.narratorSection,
            summary: settings.storyNarrator.uiLabel(lang)
        ) {
            ForEach(StoryNarrator.allCases) { narrator in
                SettingsPreferenceRow(
                    label: narrator.uiLabel(lang),
                    subtitle: narrator.uiDescription(lang),
                    selected: settings.storyNarrator == narrator
                ) {
                    settings.storyNarrator = narrator
                }
            }
        }
    }

    private var voiceSection: some View {
        SettingsSection(
            title: copy.voiceSection,
            summary: voiceSectionSummary
        ) {
            if settings.hasPremiumTtsAccess {
                SettingsSubheading(title: copy.ttsEngine)
                ForEach(ServerTtsProvider.options(for: lang, premium: true)) { provider in
                    SettingsPreferenceRow(
                        label: provider.uiLabel(lang),
                        subtitle: provider.uiDescription(lang),
                        selected: settings.serverTtsProvider == provider
                    ) {
                        settings.serverTtsProvider = provider
                    }
                }
            }

            if usesEdgeVoices {
                SettingsSubheading(title: copy.edgeVoice)
                ForEach(EdgeVoicePreset.allCases) { preset in
                    SettingsPreferenceRow(
                        label: preset.uiLabel(lang),
                        subtitle: preset.uiDescription(lang),
                        selected: settings.edgeVoicePreset == preset
                    ) {
                        settings.edgeVoicePreset = preset
                    }
                }
            } else if usesElevenLabsVoices {
                SettingsSubheading(title: copy.premiumVoiceIntro)
                ForEach(ElevenLabsVoice.allCases) { voice in
                    SettingsPreferenceRow(
                        label: voice.uiLabel(lang),
                        subtitle: voice.uiDescription(lang),
                        selected: settings.elevenLabsVoice == voice
                    ) {
                        settings.elevenLabsVoice = voice
                    }
                }
            } else {
                SettingsSubheading(title: copy.voice)
                ForEach(TtsVoice.allCases) { voice in
                    SettingsPreferenceRow(
                        label: voice.uiLabel(lang),
                        subtitle: voice.uiDescription(lang),
                        selected: settings.ttsVoice == voice
                    ) {
                        settings.ttsVoice = voice
                    }
                }

                SettingsSubheading(title: copy.emotion)
                ForEach(TtsEmotion.allCases.filter { emotion in
                    emotion != .evil || settings.ttsVoice.supportsEvil
                }) { emotion in
                    SettingsPreferenceRow(
                        label: emotion.uiLabel(lang),
                        subtitle: emotion.uiDescription(lang),
                        selected: settings.ttsEmotion == emotion
                    ) {
                        settings.ttsEmotion = emotion
                    }
                }
            }

            SettingsSubheading(title: copy.speechSpeed)
            ForEach(TtsSpeed.allCases) { speed in
                SettingsPreferenceRow(
                    label: speed.uiLabel(lang),
                    selected: settings.ttsSpeedPreset == speed
                ) {
                    settings.ttsSpeedPreset = speed
                }
            }

            SettingsSubheading(title: copy.storyLength)
            ForEach(StoryLength.allCases) { length in
                SettingsPreferenceRow(
                    label: length.uiLabel(lang),
                    subtitle: length.uiDescription(lang),
                    selected: settings.storyLength == length
                ) {
                    settings.storyLength = length
                }
            }
        }
    }

    private var generalSection: some View {
        SettingsSection(
            title: copy.generalSection,
            summary: copy.generalSummary
        ) {
            Toggle(isOn: $settings.factNotificationsEnabled) {
                Text(copy.factNotifications)
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.goldBright)

            Toggle(isOn: $settings.shazamAutoDetectEnabled) {
                Text(AppStrings.shazamAutoDetectTitle(lang))
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.goldBright)

            Toggle(isOn: $settings.speakTrackNamesInVoiceover) {
                Text(copy.speakTrackNames)
                    .foregroundStyle(AppTheme.creamText)
            }
            .tint(AppTheme.goldBright)
        }
    }

    private var modeSection: some View {
        SettingsSection(
            title: copy.modeSection,
            summary: settings.manualMode ? copy.modeManual : copy.modeAuto
        ) {
            Toggle(isOn: Binding(
                get: { settings.manualMode },
                set: {
                    settings.manualMode = $0
                    orchestrator.syncModeFromSettings()
                }
            )) {
                Text(copy.manualMode)
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
                title: AppStrings.offlinePackTitle(lang),
                summary: offlinePackSummary(state)
            ) {
                switch state.phase {
                case .idle:
                    Text(AppStrings.offlinePackIntro(lang))
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                    Button(AppStrings.offlinePackStart(lang)) {
                        Task { _ = await offlinePack.startCollecting() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AppTheme.goldBright)
                case .collecting:
                    Text(AppStrings.offlinePackCollectingHint(lang))
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                    Text(AppStrings.offlinePackProgress(collected: state.collectedCount, target: state.targetCount, lang: lang))
                        .foregroundStyle(AppTheme.goldBright)
                    ForEach(state.entries.indices, id: \.self) { index in
                        let entry = state.entries[index]
                        Text("\(entry.artist) — \(entry.title)")
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                    }
                    Button(AppStrings.offlinePackCancel(lang), role: .cancel) {
                        offlinePack.cancelPack()
                    }
                case .generating:
                    Text(AppStrings.offlinePackGenerating(ready: state.readyCount, target: state.targetCount, lang: lang))
                        .foregroundStyle(AppTheme.goldBright)
                    Text(AppStrings.offlinePackTracksReadyBody(count: state.targetCount, lang: lang))
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                case .ready:
                    Text(AppStrings.offlinePackReady(count: state.readyCount, lang: lang))
                        .foregroundStyle(AppTheme.creamText)
                    Text(AppStrings.offlinePackReadyHint(lang))
                        .font(.footnote)
                        .foregroundStyle(AppTheme.mutedLavender)
                    HStack {
                        Button(AppStrings.offlinePackRefresh(lang)) {
                            Task { _ = await offlinePack.startCollecting() }
                        }
                        Button(AppStrings.offlinePackCancel(lang), role: .cancel) {
                            offlinePack.cancelPack()
                        }
                    }
                }
            }
        }
    }

    private func offlinePackSummary(_ state: OfflinePackUiState) -> String {
        switch state.phase {
        case .idle: return copy.offlinePackPrepare
        case .collecting:
            return AppStrings.offlinePackProgress(collected: state.collectedCount, target: state.targetCount, lang: lang)
        case .generating:
            return AppStrings.offlinePackGenerating(ready: state.readyCount, target: state.targetCount, lang: lang)
        case .ready:
            return AppStrings.offlinePackReady(count: state.readyCount, lang: lang)
        }
    }

    private var triggerSection: some View {
        SettingsSection(
            title: copy.triggerSection,
            summary: settings.triggerMode.uiLabel(lang)
        ) {
            ForEach(TriggerMode.allCases) { mode in
                SettingsPreferenceRow(
                    label: mode.uiLabel(lang),
                    selected: settings.triggerMode == mode
                ) {
                    settings.triggerMode = mode
                }
            }

            if settings.triggerMode == .everyNTracks {
                Stepper(copy.everyNTracks(settings.everyNTracks), value: $settings.everyNTracks, in: 1...50)
                    .foregroundStyle(AppTheme.creamText)
            }
        }
    }

    private var spotifySection: some View {
        SettingsSection(
            title: copy.spotifySection,
            summary: nowPlaying.spotify.isConnected ? copy.spotifyConnected : copy.spotifyDisconnected
        ) {
            TextField(copy.spotifyClientId, text: $spotifyClientId)
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

            PrimaryStoryButton(title: copy.connectSpotify) {
                nowPlaying.spotify.connect()
            }
        }
    }

    private var manualSection: some View {
        SettingsSection(
            title: copy.manualSection,
            summary: copy.manualSummary
        ) {
            TextField(copy.artistField, text: $manualArtist)
                .foregroundStyle(AppTheme.creamText)
            TextField(copy.titleField, text: $manualTitle)
                .foregroundStyle(AppTheme.creamText)
            PrimaryStoryButton(
                title: copy.storyForTrack,
                loading: manualStoryLoading
            ) {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                let artist = manualArtist.trimmingCharacters(in: .whitespacesAndNewlines)
                let title = manualTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !artist.isEmpty, !title.isEmpty else {
                    orchestrator.showError(copy.manualTrackRequired)
                    return
                }
                manualStoryLoading = true
                dismiss()
                orchestrator.beginManualStoryFromSettings(artist: artist, title: title)
                manualStoryLoading = false
            }
        }
    }
}
