import Foundation

enum SettingsDefaults {
    static let backendURL = "http://127.0.0.1:3000"
    static let everyNTracks = 10
    static let sameTrackStoryEveryN = 3
    static let ttsSpeed: Float = 0.92
}

@MainActor
final class SettingsStore: ObservableObject {
    static let shared = SettingsStore()

    private enum Keys {
        static let backendURL = "backend_url"
        static let installId = "install_id"
        static let accessToken = "access_token"
        static let tokenExpiresAt = "token_expires_at"
        static let manualMode = "manual_mode"
        static let onboardingComplete = "onboarding_complete"
        static let triggerMode = "trigger_mode"
        static let everyNTracks = "every_n_tracks"
        static let sameTrackStoryEveryN = "same_track_story_every_n"
        static let specificArtists = "specific_artists"
        static let specificGenres = "specific_genres"
        static let autoIntercept = "auto_intercept"
        static let spotifyClientId = "spotify_client_id"
        static let spotifyRedirectURI = "spotify_redirect_uri"
        static let offlineAudioCacheEnabled = "offline_audio_cache_enabled"
        static let factNotificationsEnabled = "fact_notifications_enabled"
    }

    private let defaults = UserDefaults.standard

    @Published var backendURL: String {
        didSet { defaults.set(backendURL, forKey: Keys.backendURL) }
    }

    @Published var manualMode: Bool {
        didSet { defaults.set(manualMode, forKey: Keys.manualMode) }
    }

    @Published var onboardingComplete: Bool {
        didSet { defaults.set(onboardingComplete, forKey: Keys.onboardingComplete) }
    }

    @Published var triggerMode: TriggerMode {
        didSet { defaults.set(triggerMode.rawValue, forKey: Keys.triggerMode) }
    }

    @Published var everyNTracks: Int {
        didSet { defaults.set(everyNTracks, forKey: Keys.everyNTracks) }
    }

    @Published var sameTrackStoryEveryN: Int {
        didSet { defaults.set(sameTrackStoryEveryN, forKey: Keys.sameTrackStoryEveryN) }
    }

    @Published var specificArtists: [String] {
        didSet { defaults.set(specificArtists, forKey: Keys.specificArtists) }
    }

    @Published var specificGenres: [String] {
        didSet { defaults.set(specificGenres, forKey: Keys.specificGenres) }
    }

    @Published var autoIntercept: Bool {
        didSet { defaults.set(autoIntercept, forKey: Keys.autoIntercept) }
    }

    @Published var spotifyClientId: String {
        didSet { defaults.set(spotifyClientId, forKey: Keys.spotifyClientId) }
    }

    @Published var spotifyRedirectURI: String {
        didSet { defaults.set(spotifyRedirectURI, forKey: Keys.spotifyRedirectURI) }
    }

    @Published var offlineAudioCacheEnabled: Bool {
        didSet { defaults.set(offlineAudioCacheEnabled, forKey: Keys.offlineAudioCacheEnabled) }
    }

    @Published var factNotificationsEnabled: Bool {
        didSet { defaults.set(factNotificationsEnabled, forKey: Keys.factNotificationsEnabled) }
    }

    private init() {
        backendURL = defaults.string(forKey: Keys.backendURL) ?? SettingsDefaults.backendURL
        manualMode = defaults.bool(forKey: Keys.manualMode)
        onboardingComplete = defaults.bool(forKey: Keys.onboardingComplete)
        triggerMode = TriggerMode(rawValue: defaults.string(forKey: Keys.triggerMode) ?? "") ?? .everyNTracks
        everyNTracks = defaults.object(forKey: Keys.everyNTracks) as? Int ?? SettingsDefaults.everyNTracks
        sameTrackStoryEveryN = defaults.object(forKey: Keys.sameTrackStoryEveryN) as? Int ?? SettingsDefaults.sameTrackStoryEveryN
        specificArtists = defaults.stringArray(forKey: Keys.specificArtists) ?? []
        specificGenres = defaults.stringArray(forKey: Keys.specificGenres) ?? []
        autoIntercept = defaults.object(forKey: Keys.autoIntercept) as? Bool ?? true
        spotifyClientId = defaults.string(forKey: Keys.spotifyClientId) ?? ""
        spotifyRedirectURI = defaults.string(forKey: Keys.spotifyRedirectURI) ?? "efirai://spotify-callback"
        offlineAudioCacheEnabled = defaults.object(forKey: Keys.offlineAudioCacheEnabled) as? Bool ?? true
        factNotificationsEnabled = defaults.object(forKey: Keys.factNotificationsEnabled) as? Bool ?? true
    }

    var installId: String {
        if let existing = defaults.string(forKey: Keys.installId), !existing.isEmpty {
            return existing
        }
        let fresh = UUID().uuidString.lowercased()
        defaults.set(fresh, forKey: Keys.installId)
        return fresh
    }

    var triggerSettings: TriggerSettings {
        TriggerSettings(
            mode: triggerMode,
            everyNTracks: everyNTracks,
            sameTrackStoryEveryN: sameTrackStoryEveryN,
            specificArtists: Set(specificArtists),
            specificGenres: Set(specificGenres),
            autoIntercept: autoIntercept
        )
    }

    func readAuthState() -> (accessToken: String, expiresAtMs: Int64) {
        (
            accessToken: defaults.string(forKey: Keys.accessToken) ?? "",
            expiresAtMs: Int64(defaults.double(forKey: Keys.tokenExpiresAt))
        )
    }

    func saveAuthToken(_ token: String, expiresAtMs: Int64) {
        defaults.set(token, forKey: Keys.accessToken)
        defaults.set(Double(expiresAtMs), forKey: Keys.tokenExpiresAt)
    }

    func clearAuthToken() {
        defaults.removeObject(forKey: Keys.accessToken)
        defaults.removeObject(forKey: Keys.tokenExpiresAt)
    }
}
