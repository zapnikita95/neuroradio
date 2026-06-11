import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var step = 0

    var body: some View {
        MusicStoryBackground {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(spacing: compactSpacing) {
                        BrandTitle(fontSize: step == 0 ? 28 : 22)
                            .padding(.top, step == 0 ? 24 : 12)

                        if step == 0 {
                            Text("Нейро-ведущий для Spotify и Apple Music")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(AppTheme.creamText)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)

                            Text("На iPhone — Spotify, Apple Music и ShazamKit. Истории голосом, пока играет ваш трек.")
                                .multilineTextAlignment(.center)
                                .foregroundStyle(AppTheme.mutedLavender)
                                .padding(.horizontal)
                        }

                        if step < 2 {
                            VinylDisc(spinning: true)
                                .scaleEffect(step == 0 ? 1 : 0.82)
                                .padding(.vertical, step == 0 ? 8 : 4)
                        }

                        GlassCard(accentBorder: true) {
                            VStack(alignment: .leading, spacing: 12) {
                                onboardingRow(done: step > 0, title: "Уведомления", subtitle: "Кнопка «Рассказать историю» на push")
                                onboardingRow(done: step > 1, title: "Spotify", subtitle: "Опционально — для авто-режима")
                                onboardingRow(done: step > 2, title: "Аккаунт", subtitle: "Telegram или email — история в облаке")
                            }
                        }
                        .padding(.horizontal)
                    }
                    .padding(.bottom, 16)
                }

                bottomActions
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
            }
        }
    }

    private var compactSpacing: CGFloat {
        step == 0 ? 24 : 14
    }

    @ViewBuilder
    private var bottomActions: some View {
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
            .onChange(of: nowPlaying.spotify.isConnected) { _, connected in
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
