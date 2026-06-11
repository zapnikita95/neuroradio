import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var orchestrator: StoryOrchestrator
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var showSettings = false
    @State private var showHistory = false
    @State private var showAccount = false

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
                                Text("Готовим историю…")
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

                actionButtons
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
            BrandTitle()
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
            Text(orchestrator.uiState.isMonitoringActive ? "Музыка играет" : "Ожидание трека")
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.liveGreen)
        }
    }

    private var trackInfo: some View {
        VStack(spacing: 8) {
            Text(nowPlaying.currentTrack?.title ?? "Слушаем…")
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
            Text(settings.storyNarrator.labelRu)
                .font(.caption.weight(.semibold))
                .foregroundStyle(AppTheme.mutedLavender)
            Text(statusText)
                .font(.subheadline)
                .foregroundStyle(AppTheme.creamText)
        }
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

            SecondaryStoryButton(
                title: nowPlaying.shazam.isListening ? AppStrings.Shazam.listeningHint : AppStrings.Shazam.recognizeButton,
                enabled: !nowPlaying.shazam.isListening
            ) {
                Task {
                    orchestrator.clearError()
                    do {
                        _ = try await nowPlaying.recognizeWithShazam()
                    } catch {
                        orchestrator.showError(error.localizedDescription)
                    }
                }
            }

            if orchestrator.uiState.state == .playingStory || orchestrator.uiState.state == .preparingPlayback {
                Button("Остановить историю") { orchestrator.stopStory() }
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
        case .fetchingStory: return "Генерируем историю…"
        case .preparingPlayback, .playingStory: return "История играет…"
        default: return "Рассказать историю"
        }
    }

    private var trackSubtitle: String {
        if let artist = nowPlaying.currentTrack?.artist, !artist.isEmpty {
            return artist
        }
        return AppStrings.Shazam.homeIdleSubtitle
    }

    private var statusText: String {
        switch orchestrator.uiState.state {
        case .fetchingStory: return "Готовим историю…"
        case .preparingPlayback: return "Воспроизводим историю"
        case .playingStory: return "Воспроизводим историю"
        default:
            switch orchestrator.uiState.mode {
            case .auto:
                if let n = orchestrator.uiState.tracksUntilNext {
                    return UserFacingError.tracksUntilLabel(n)
                }
                return "Авто · мониторинг"
            case .manual:
                return "Ручной режим"
            }
        }
    }
}
