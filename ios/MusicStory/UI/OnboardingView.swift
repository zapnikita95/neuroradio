import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var step = 0

    private let introSlotHeight: CGFloat = 96
    private let vinylSlotHeight: CGFloat = 148
    private let checklistSlotHeight: CGFloat = 196

    var body: some View {
        MusicStoryBackground {
            VStack(spacing: 0) {
                headerSlot
                    .padding(.horizontal, 24)
                    .padding(.top, 16)

                vinylSlot
                    .padding(.horizontal, 24)
                    .padding(.top, 8)

                checklistSlot
                    .padding(.horizontal, 24)
                    .padding(.top, 12)

                Spacer(minLength: 12)

                bottomActions
                    .padding(.horizontal, 24)
                    .padding(.bottom, 12)
            }
        }
    }

    private var headerSlot: some View {
        VStack(spacing: 8) {
            BrandTitle(fontSize: 26)

            ZStack {
                VStack(spacing: 8) {
                    Text("Нейро-ведущий для Spotify и Apple Music")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(AppTheme.creamText)
                        .multilineTextAlignment(.center)

                    Text("На iPhone — Spotify, Apple Music и ShazamKit. Истории голосом, пока играет ваш трек.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(AppTheme.mutedLavender)
                        .lineLimit(3)
                }
                .opacity(step == 0 ? 1 : 0)
            }
            .frame(height: introSlotHeight)
        }
    }

    private var vinylSlot: some View {
        VinylDisc(spinning: true)
            .frame(height: vinylSlotHeight)
            .frame(maxWidth: .infinity)
    }

    private var checklistSlot: some View {
        GlassCard(accentBorder: true) {
            VStack(alignment: .leading, spacing: 10) {
                onboardingRow(
                    targetStep: 0,
                    done: step > 0,
                    title: "Уведомления",
                    subtitle: "Кнопка «Рассказать историю» на push"
                )
                onboardingRow(
                    targetStep: 1,
                    done: step > 1,
                    title: "Spotify",
                    subtitle: "Опционально — для авто-режима"
                )
                onboardingRow(
                    targetStep: 2,
                    done: step > 2,
                    title: "Аккаунт",
                    subtitle: "Telegram или email — история в облаке"
                )
            }
        }
        .frame(height: checklistSlotHeight, alignment: .top)
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
            VStack(spacing: 10) {
                Text("В Spotify включите трек, затем подтвердите доступ — приложение вернётся само.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedLavender)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .frame(minHeight: 36)

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

    private func onboardingRow(
        targetStep: Int,
        done: Bool,
        title: String,
        subtitle: String
    ) -> some View {
        Button {
            step = targetStep
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: done ? "checkmark.circle.fill" : (step == targetStep ? "largecircle.fill.circle" : "circle"))
                    .foregroundStyle(done ? AppTheme.liveGreen : (step == targetStep ? AppTheme.accentViolet : AppTheme.mutedLavender))
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(AppTheme.creamText)
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.mutedLavender)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(step == targetStep ? AppTheme.accentViolet : AppTheme.mutedLavender.opacity(0.5))
                    .padding(.top, 4)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
