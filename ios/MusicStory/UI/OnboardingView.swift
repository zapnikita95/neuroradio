import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var step = 0
    @State private var notificationsGranted = false

    var body: some View {
        MusicStoryBackground {
            VStack(spacing: 24) {
                Text("Music Story")
                    .font(.largeTitle.bold())
                    .foregroundStyle(AppTheme.goldBright)

                Text("На iPhone приложение работает иначе, чем на Android: без доступа к чужим уведомлениям, но с Spotify, Apple Music и ShazamKit.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AppTheme.creamText)
                    .padding(.horizontal)

                GlassCard {
                    VStack(alignment: .leading, spacing: 12) {
                        onboardingRow(
                            done: step > 0,
                            title: "Уведомления",
                            subtitle: "Кнопка «Рассказать историю» на push о новом треке"
                        )
                        onboardingRow(
                            done: step > 1,
                            title: "Spotify (опционально)",
                            subtitle: "Client ID в настройках + SpotifyiOS SDK для авто-режима"
                        )
                        onboardingRow(
                            done: step > 2,
                            title: "ShazamKit",
                            subtitle: "Распознавание Яндекс Музыки и других плееров по кнопке"
                        )
                    }
                }
                .padding(.horizontal)

                if step == 0 {
                    PrimaryStoryButton(title: "Разрешить уведомления") {
                        Task {
                            notificationsGranted = await NotificationService.shared.requestAuthorization()
                            step = 1
                        }
                    }
                } else if step == 1 {
                    PrimaryStoryButton(title: "Подключить Spotify") {
                        nowPlaying.spotify.connect()
                        step = 2
                    }
                    Button("Пропустить") { step = 2 }
                        .foregroundStyle(AppTheme.mutedLavender)
                } else {
                    PrimaryStoryButton(title: "Начать") {
                        settings.onboardingComplete = true
                    }
                }

                Spacer()
            }
            .padding(.top, 40)
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
