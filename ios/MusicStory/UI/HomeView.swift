import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var orchestrator: StoryOrchestrator
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var showSettings = false
    @State private var showHistory = false

    var body: some View {
        MusicStoryBackground {
            VStack(spacing: 0) {
                topBar

                Spacer()

                VinylDisc(spinning: isSpinning)
                    .padding(.bottom, 24)

                trackInfo
                    .padding(.horizontal, 24)

                statusLine
                    .padding(.top, 12)

                if let error = orchestrator.uiState.errorMessage {
                    Text(error)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.errorCoral)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.top, 8)
                }

                Spacer()

                actionButtons
                    .padding(.horizontal, 24)
                    .padding(.bottom, 32)
            }
        }
        .navigationDestination(isPresented: $showSettings) {
            SettingsView()
        }
        .navigationDestination(isPresented: $showHistory) {
            HistoryView()
        }
    }

    private var topBar: some View {
        HStack {
            SourceBadge(source: nowPlaying.activeSource)
            Spacer()
            Button { showHistory = true } label: {
                Image(systemName: "book.closed")
                    .foregroundStyle(AppTheme.goldBright)
            }
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
                    .foregroundStyle(AppTheme.goldBright)
            }
        }
        .padding()
    }

    private var trackInfo: some View {
        VStack(spacing: 8) {
            Text(nowPlaying.currentTrack?.title ?? "Слушаем…")
                .font(.title2.bold())
                .foregroundStyle(AppTheme.creamText)
                .multilineTextAlignment(.center)
                .lineLimit(2)

            Text(nowPlaying.currentTrack?.artist ?? "Запусти Spotify, Apple Music или нажми Shazam")
                .font(.body)
                .foregroundStyle(AppTheme.mutedLavender)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
    }

    private var statusLine: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(orchestrator.uiState.isMonitoringActive ? AppTheme.liveGreen : AppTheme.mutedLavender)
                .frame(width: 8, height: 8)
            Text(statusText)
                .font(.caption)
                .foregroundStyle(AppTheme.mutedLavender)
        }
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            PrimaryStoryButton(
                title: primaryButtonTitle,
                enabled: orchestrator.uiState.state != .fetchingStory
            ) {
                Task { await orchestrator.requestManualStory() }
            }

            Button {
                Task {
                    do {
                        _ = try await nowPlaying.recognizeWithShazam()
                    } catch {
                        orchestrator.showError(error.localizedDescription)
                    }
                }
            } label: {
                Text("Распознать через Shazam")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .foregroundStyle(AppTheme.goldBright)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(AppTheme.goldWarm.opacity(0.5), lineWidth: 1)
                    )
            }
            .disabled(nowPlaying.shazam.isListening)

            if orchestrator.uiState.state == .playingStory || orchestrator.uiState.state == .preparingPlayback {
                Button("Остановить") { orchestrator.stopStory() }
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

    private var primaryButtonTitle: String {
        switch orchestrator.uiState.state {
        case .fetchingStory: return "Генерируем историю…"
        case .preparingPlayback, .playingStory: return "История играет…"
        default: return "Рассказать историю"
        }
    }

    private var statusText: String {
        switch orchestrator.uiState.mode {
        case .auto:
            if let n = orchestrator.uiState.tracksUntilNext {
                return "Авто · через \(n) трек(ов)"
            }
            return "Авто · мониторинг"
        case .manual:
            return "Ручной режим"
        }
    }
}
