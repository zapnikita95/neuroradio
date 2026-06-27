import SwiftUI

struct RadioModeOnboardingView: View {
    @EnvironmentObject private var settings: SettingsStore

    let onFinished: () -> Void

    @State private var showDeferExplanation = false

    private var copy: AppL10n { AppStrings.l10n(settings.resolvedLanguage) }

    var body: some View {
        MusicStoryBackground {
            VStack(spacing: 0) {
                Spacer(minLength: 24)

                BrandTitle(fontSize: 26, lang: settings.resolvedLanguage)

                Text(showDeferExplanation ? copy.radioOnboardingDeferTitle : copy.radioOnboardingTitle)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(AppTheme.creamText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .padding(.top, 16)

                GlassCard(accentBorder: true) {
                    Text(showDeferExplanation ? copy.radioOnboardingDeferBody : copy.radioOnboardingBody)
                        .font(.body)
                        .foregroundStyle(AppTheme.mutedLavender)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)

                Spacer()

                VStack(spacing: 10) {
                    if showDeferExplanation {
                        PrimaryStoryButton(title: copy.radioOnboardingContinue) {
                            WelcomeTrialCoordinator.enableScrobbleOnlyMode(settings: settings)
                            onFinished()
                        }
                    } else {
                        PrimaryStoryButton(title: copy.radioOnboardingEnable) {
                            WelcomeTrialCoordinator.enableRadioStationMode(settings: settings)
                            onFinished()
                        }
                        Button(copy.radioOnboardingLater) {
                            showDeferExplanation = true
                        }
                        .foregroundStyle(AppTheme.mutedLavender)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
        }
    }
}
