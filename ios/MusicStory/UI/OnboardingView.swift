import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var settings: SettingsStore
    @EnvironmentObject private var nowPlaying: NowPlayingCoordinator

    @State private var step = 0
    @State private var notificationsGranted = false

    var body: some View {
        MusicStoryBackground {
            VStack(spacing: 24) {
                Text(AppStrings.Onboarding.title)
                    .font(.largeTitle.bold())
                    .foregroundStyle(AppTheme.goldBright)

                Text(introText)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(AppTheme.creamText)
                    .padding(.horizontal)

                GlassCard {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(visibleRows, id: \.title) { row in
                            onboardingRow(done: row.done, title: row.title, subtitle: row.subtitle)
                        }
                    }
                }
                .padding(.horizontal)

                actionArea

                Spacer()
            }
            .padding(.top, 40)
        }
    }

    private var introText: String {
        switch step {
        case 0:
            return AppStrings.Onboarding.iosIntro
        case 3:
            return AppStrings.Onboarding.headphonesSubtitle
        default:
            return ""
        }
    }

    private var visibleRows: [(done: Bool, title: String, subtitle: String)] {
        switch step {
        case 0:
            return [
                (false, AppStrings.Onboarding.appleMusicTitle, AppStrings.Onboarding.appleMusicSubtitle),
                (false, AppStrings.Onboarding.spotifyTitle, AppStrings.Onboarding.spotifySubtitle),
                (false, AppStrings.Onboarding.shazamTitle, AppStrings.Onboarding.shazamSubtitle),
            ]
        case 1:
            return [
                (step > 0, AppStrings.Onboarding.notificationsTitle, AppStrings.Onboarding.notificationsSubtitle),
                (false, AppStrings.Onboarding.spotifyTitle, AppStrings.Onboarding.spotifySubtitle),
                (false, AppStrings.Onboarding.shazamTitle, AppStrings.Onboarding.shazamSubtitle),
            ]
        case 2:
            return [
                (true, AppStrings.Onboarding.notificationsTitle, AppStrings.Onboarding.notificationsSubtitle),
                (step > 2, AppStrings.Onboarding.spotifyTitle, AppStrings.Onboarding.spotifySubtitle),
                (false, AppStrings.Onboarding.shazamTitle, AppStrings.Onboarding.shazamSubtitle),
            ]
        default:
            return [
                (true, AppStrings.Onboarding.notificationsTitle, AppStrings.Onboarding.notificationsSubtitle),
                (true, AppStrings.Onboarding.spotifyTitle, AppStrings.Onboarding.spotifySubtitle),
                (true, AppStrings.Onboarding.shazamTitle, AppStrings.Onboarding.shazamSubtitle),
                (step > 3, AppStrings.Onboarding.headphonesTitle, AppStrings.Onboarding.headphonesSubtitle),
            ]
        }
    }

    @ViewBuilder
    private var actionArea: some View {
        switch step {
        case 0:
            PrimaryStoryButton(title: AppStrings.Onboarding.next) {
                step = 1
            }
        case 1:
            PrimaryStoryButton(title: AppStrings.Onboarding.allowNotifications) {
                Task {
                    notificationsGranted = await NotificationService.shared.requestAuthorization()
                    step = 2
                }
            }
        case 2:
            PrimaryStoryButton(title: AppStrings.Onboarding.connectSpotify) {
                nowPlaying.spotify.connect()
                step = 3
            }
            Button(AppStrings.Onboarding.skip) { step = 3 }
                .foregroundStyle(AppTheme.mutedLavender)
        default:
            PrimaryStoryButton(title: AppStrings.Onboarding.begin) {
                settings.shazamAutoDetectEnabled = true
                settings.onboardingComplete = true
            }
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
