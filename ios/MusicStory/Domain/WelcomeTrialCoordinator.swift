import Foundation

@MainActor
enum WelcomeTrialCoordinator {
    static let trialStartedNotification = Notification.Name("welcomeTrialStarted")

    static func handleGranted(settings: SettingsStore, trialUntil: Int64?) {
        guard let until = trialUntil, until > Int64(Date().timeIntervalSince1970 * 1000) else { return }

        var profile = settings.accountProfile ?? AccountProfile()
        profile.plan = "trial"
        profile.trialUntil = until
        settings.accountProfile = profile
        applyPremiumExperienceDefaults(settings: settings)
        NotificationCenter.default.post(name: trialStartedNotification, object: nil, userInfo: ["trialUntil": until])
    }

    static func preparePremiumExperienceForFirstStory(settings: SettingsStore) {
        applyPremiumExperienceDefaults(settings: settings)
    }

    static func applyPremiumExperienceDefaults(settings: SettingsStore) {
        settings.serverTtsProvider = .yandex
        settings.ttsVoice = .zahar
        if settings.resolvedLanguage == .en {
            settings.serverTtsProvider = .elevenlabs
        }
        if settings.autoIntercept {
            settings.applyAutoPlaybackDefaults()
        }
    }

    static func applyPremiumDefaults(settings: SettingsStore) {
        applyPremiumExperienceDefaults(settings: settings)
    }

    static func enableRadioStationMode(settings: SettingsStore) {
        settings.applyAutoPlaybackDefaults()
    }

    static func enableScrobbleOnlyMode(settings: SettingsStore) {
        settings.manualMode = true
        settings.autoIntercept = false
    }
}

extension SettingsStore {
    func applyAutoPlaybackDefaults() {
        autoIntercept = true
        manualMode = false
        triggerMode = .everyNTracks
        everyNTracks = 3
    }

    var isReviewerAccount: Bool {
        guard let email = accountProfile?.email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !email.isEmpty else { return false }
        return Self.reviewerEmails.contains(email)
    }

    fileprivate static let reviewerEmails: Set<String> = [
        "appletester@test.ru",
        "appletester@test.com",
        "googletester@test.ru",
    ]
}
