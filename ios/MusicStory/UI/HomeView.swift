import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var orchestrator: StoryOrchestrator
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var showSettings = false
    @State private var showHistory = false
    @State private var showAccount = false

    private var lang: ResolvedAppLanguage { settings.resolvedLanguage }
    private var copy: AppL10n { AppStrings.l10n(lang) }

    private var personaVoiceLabel: String {
        let narrator = settings.storyNarrator.uiLabel(lang)
        let voice: String
        if lang == .en && settings.hasPremiumTtsAccess {
            voice = "ElevenLabs"
        } else if settings.hasPremiumTtsAccess {
            voice = settings.ttsVoice.uiLabel(lang)
        } else {
            voice = settings.edgeVoicePreset.uiLabel(lang)
        }
        return "\(narrator) · \(voice)"
    }

    var body: some View {
        MusicStoryBackground {
            ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                topBar

                ScrollView {
                    VStack(spacing: 0) {
                        Spacer(minLength: 8)

                        VinylDisc(
                            spinning: isSpinning,
                            tonearmOnDisc: tonearmOnDisc
                        )
                        .padding(.bottom, 12)

                        serviceStatus
                            .padding(.bottom, 20)

                        trackInfo
                            .padding(.horizontal, 24)

                        orchestratorStatus
                            .padding(.top, 16)
                            .padding(.horizontal, 24)

                        if orchestrator.uiState.state == .fetchingStory {
                            HStack(spacing: 10) {
                                ProgressView().tint(AppTheme.accentViolet)
                                Text(copy.preparingStory)
                                    .foregroundStyle(AppTheme.mutedLavender)
                            }
                            .padding(.top, 12)
                        }

                        if let error = orchestrator.uiState.errorMessage {
                            Text(error)
                                .font(.subheadline)
                                .foregroundStyle(AppTheme.errorCoral)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 24)
                                .padding(.top, 12)
                        }

                        Spacer(minLength: 24)
                    }
                }

                VStack(spacing: 14) {
                    if orchestrator.uiState.generationPreview.isActive,
                       !orchestrator.uiState.generationPreview.words.isEmpty {
                        StoryGenerationPreview(
                            preview: orchestrator.uiState.generationPreview,
                            spokenLabel: copy.storySpokenTranscript
                        )
                    }

                    actionButtons
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 28)
            }

            if let feedback = orchestrator.uiState.pendingFeedback,
               orchestrator.uiState.state == .listening || orchestrator.uiState.state == .playingStory {
                StoryFeedbackSheet(
                    feedback: feedback,
                    onDismiss: { orchestrator.clearFeedbackPrompt() },
                    onSubmitted: {
                        orchestrator.clearFeedbackIfStory(trackKey: feedback.trackKey, script: feedback.script)
                    }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            shazamFloatingControl
            }
        }
        .navigationBarHidden(true)
        .navigationDestination(isPresented: $showSettings) {
            SettingsView()
        }
        .navigationDestination(isPresented: $showHistory) {
            HistoryView()
        }
        .navigationDestination(isPresented: $showAccount) {
            AccountView()
        }
    }

    private var topBar: some View {
        HStack {
            BrandTitle(lang: lang)
            Spacer()
            Button { showAccount = true } label: {
                Image(systemName: "person.crop.circle")
                    .font(.title3)
                    .foregroundStyle(AppTheme.accentViolet)
            }
            Button { showHistory = true } label: {
                Image(systemName: "clock.arrow.circlepath")
                    .foregroundStyle(AppTheme.accentViolet)
            }
            Button { showSettings = true } label: {
                Image(systemName: "gearshape.fill")
                    .foregroundStyle(AppTheme.accentViolet)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(AppTheme.deepVoid.opacity(0.65))
    }

    private var serviceStatus: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(orchestrator.uiState.isMonitoringActive ? AppTheme.liveGreen : AppTheme.mutedLavender)
                .frame(width: 8, height: 8)
            Text(orchestrator.uiState.isMonitoringActive ? copy.musicPlaying : copy.waitingTrack)
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.liveGreen)
        }
    }

    private var trackInfo: some View {
        VStack(spacing: 8) {
            Text(nowPlaying.currentTrack?.title ?? copy.listening)
                .font(.title2.bold())
                .foregroundStyle(AppTheme.creamText)
                .multilineTextAlignment(.center)
                .lineLimit(2)

            Text(trackSubtitle)
                .font(.body)
                .foregroundStyle(AppTheme.accentViolet)
                .multilineTextAlignment(.center)
                .lineLimit(3)

            SourceBadge(source: nowPlaying.activeSource)
        }
    }

    private var orchestratorStatus: some View {
        VStack(spacing: 4) {
            Text(personaVoiceLabel)
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.mutedLavender)
            Text(statusText)
                .font(.subheadline)
                .foregroundStyle(AppTheme.creamText)
        }
    }

    private var shazamFloatingControl: some View {
        ShazamFloatingButton(
            isListening: nowPlaying.shazam.isListening,
            action: { Task { await recognizeWithShazam() } }
        )
        .padding(.top, 56)
        .padding(.trailing, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            PrimaryStoryButton(
                title: primaryButtonTitle,
                enabled: orchestrator.uiState.state != .fetchingStory,
                loading: orchestrator.uiState.state == .fetchingStory
            ) {
                Task { await orchestrator.requestManualStory() }
            }

            if orchestrator.uiState.state == .playingStory || orchestrator.uiState.state == .preparingPlayback {
                Button(copy.stopStory) { orchestrator.stopStory() }
                    .foregroundStyle(AppTheme.errorCoral)
            }
        }
    }

    private var isSpinning: Bool {
        nowPlaying.currentTrack != nil &&
            (nowPlaying.isPlaying ||
                orchestrator.uiState.state == .fetchingStory ||
                orchestrator.uiState.state == .playingStory)
    }

    private var tonearmOnDisc: Bool {
        nowPlaying.currentTrack != nil &&
            orchestrator.uiState.state != .playingStory &&
            orchestrator.uiState.state != .preparingPlayback &&
            (nowPlaying.isPlaying || orchestrator.uiState.state == .fetchingStory)
    }

    private var primaryButtonTitle: String {
        switch orchestrator.uiState.state {
        case .fetchingStory: return copy.generatingStory
        case .preparingPlayback, .playingStory: return copy.storyPlaying
        default: return copy.tellStory
        }
    }

    private var trackSubtitle: String {
        if let artist = nowPlaying.currentTrack?.artist, !artist.isEmpty {
            return artist
        }
        return AppStrings.shazamHomeIdle(lang)
    }

    private func recognizeWithShazam() async {
        orchestrator.clearError()
        do {
            _ = try await nowPlaying.recognizeWithShazam()
        } catch {
            orchestrator.showError(error.localizedDescription)
        }
    }

    private var statusText: String {
        switch orchestrator.uiState.state {
        case .fetchingStory: return copy.preparingStory
        case .preparingPlayback, .playingStory: return copy.playingStory
        default:
            switch orchestrator.uiState.mode {
            case .auto:
                if let n = orchestrator.uiState.tracksUntilNext {
                    return copy.tracksUntil(n)
                }
                return copy.autoMonitoring
            case .manual:
                return copy.manualModeStatus
            }
        }
    }
}

private struct StoryGenerationPreview: View {
    let preview: GenerationPreviewState
    let spokenLabel: String

    var body: some View {
        let words = preview.words
        let visibleCount = min(preview.visibleWordCount, words.count)
        let visibleText = words.prefix(visibleCount).joined(separator: " ")
        Group {
            if !visibleText.isEmpty {
                VStack(spacing: 8) {
                    if preview.isSpokenTranscript {
                        Text(spokenLabel)
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedLavender)
                            .frame(maxWidth: .infinity)
                    }
                    ScrollView {
                        Text(visibleText)
                            .font(.body)
                            .foregroundStyle(AppTheme.creamText)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                    .frame(maxHeight: 220)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(AppTheme.surfaceGlass)
                .clipShape(RoundedRectangle(cornerRadius: 18))
            }
        }
    }
}
