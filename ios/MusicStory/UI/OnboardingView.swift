import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var step = 0

    var body: some View {
        MusicStoryBackground {
            ScrollView {
                VStack(spacing: 24) {
                    BrandTitle(fontSize: 28)
                        .padding(.top, 24)

                    Text("Нейро-ведущий для Spotify и Apple Music")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(AppTheme.creamText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)

                    Text("На iPhone — Spotify, Apple Music и ShazamKit. Истории голосом, пока играет ваш трек.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(AppTheme.mutedLavender)
                        .padding(.horizontal)

                    VinylDisc(spinning: true)
                        .padding(.vertical, 8)

                    GlassCard(accentBorder: true) {
                        VStack(alignment: .leading, spacing: 12) {
                            onboardingRow(done: step > 0, title: "Уведомления", subtitle: "Кнопка «Рассказать историю» на push")
                            onboardingRow(done: step > 1, title: "Spotify", subtitle: "Опционально — для авто-режима")
                            onboardingRow(done: step > 2, title: "Аккаунт", subtitle: "Telegram или email — история в облаке")
                        }
                    }
                    .padding(.horizontal)

                    stepContent
                        .padding(.horizontal)

                    Spacer(minLength: 24)
                }
            }
        }
    }

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case 0:
            PrimaryStoryButton(title: "Разрешить уведомления") {
                Task {
                    _ = await NotificationService.shared.requestAuthorization()
                    step = 1
                }
            }
        case 1:
            VStack(spacing: 12) {
                Text("В Spotify включите трек, затем подтвердите доступ — приложение вернётся само.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedLavender)
                    .multilineTextAlignment(.center)

                if let error = nowPlaying.spotify.connectionError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(AppTheme.errorCoral)
                        .multilineTextAlignment(.center)
                }

                PrimaryStoryButton(title: nowPlaying.spotify.isConnected ? "Spotify подключён" : "Подключить Spotify") {
                    if nowPlaying.spotify.isConnected {
                        step = 2
                    } else {
                        nowPlaying.spotify.connect()
                    }
                }
                .disabled(nowPlaying.spotify.isAuthorizing)

                if nowPlaying.spotify.isAuthorizing {
                    ProgressView().tint(AppTheme.accentViolet)
                }

                Button("Пропустить") { step = 2 }
                    .foregroundStyle(AppTheme.mutedLavender)
            }
            .onChange(of: nowPlaying.spotify.isConnected) { connected in
                if connected { step = 2 }
            }
        default:
            AccountAuthPanel(
                onSuccess: { settings.onboardingComplete = true },
                onSkip: { settings.onboardingComplete = true },
                skipTitle: "Начать без входа"
            )
        }
    }

    private func onboardingRow(done: Bool, title: String, subtitle: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(done ? AppTheme.liveGreen : AppTheme.mutedLavender)
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(AppTheme.creamText)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(AppTheme.mutedLavender)
            }
        }
    }
}
