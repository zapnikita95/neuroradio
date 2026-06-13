import Foundation

enum SettingsDefaults {
    static let spotifyRedirectURI = "efirai://spotify-callback"
    static let backendURL = BackendURL.canonical
    static let everyNTracks = 10
    static let sameTrackStoryEveryN = 3
    static let ttsSpeedPreset: TtsSpeed = .normal
    static let musicFadeSeconds: Float = 2.0
    static let storyLength: StoryLength = .sec60
    /// Как Android `DEFAULT_SPEAK_TRACK_NAMES_IN_VOICEOVER`.
    static let speakTrackNamesInVoiceover = true
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
        static let onboardingVersion = "onboarding_version"
        static let triggerMode = "trigger_mode"
        static let everyNTracks = "every_n_tracks"
        static let sameTrackStoryEveryN = "same_track_story_every_n"
        static let ttsSpeed = "tts_speed"
        static let ttsSpeedPreset = "tts_speed_preset"
        static let ttsEmotion = "tts_emotion"
        static let musicFadeSeconds = "music_fade_seconds"
        static let specificArtists = "specific_artists"
        static let specificGenres = "specific_genres"
        static let autoIntercept = "auto_intercept"
        static let speakTrackNamesInVoiceover = "speak_track_names_in_voiceover"
        static let spotifyClientId = "spotify_client_id"
        static let spotifyRedirectURI = "spotify_redirect_uri"
        static let serverTtsProvider = "server_tts_provider"
        static let serverTier = "server_tier"
        static let storyNarrator = "story_narrator"
        static let ttsVoice = "tts_voice"
        static let edgeVoicePreset = "edge_voice_preset"
        static let storyLength = "story_length"
        static let accountProfile = "account_profile_json"
        static let offlineAudioCacheEnabled = "offline_audio_cache_enabled"
        static let offlinePackPhase = "offline_pack_phase"
        static let offlinePackSessionId = "offline_pack_session_id"
        static let factNotificationsEnabled = "fact_notifications_enabled"
        static let shazamAutoDetectEnabled = "shazam_auto_detect_enabled"
        static let playbackCachePurgeVersion = "playback_cache_purge_version"
        static let appLanguage = "app_language"
    }

    /// Сброс битого OGG-кэша при обновлении (AVPlayer на iOS не играет OGG).
    private static let playbackCachePurgeTarget = 105

    private let defaults = UserDefaults.standard

    @Published var backendURL: String {
        didSet { defaults.set(BackendURL.normalize(backendURL), forKey: Keys.backendURL) }
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

    @Published var ttsSpeedPreset: TtsSpeed {
        didSet { defaults.set(ttsSpeedPreset.rawValue, forKey: Keys.ttsSpeedPreset) }
    }

    @Published var ttsEmotion: TtsEmotion {
        didSet { defaults.set(ttsEmotion.rawValue, forKey: Keys.ttsEmotion) }
    }

    @Published var musicFadeSeconds: Float {
        didSet { defaults.set(musicFadeSeconds, forKey: Keys.musicFadeSeconds) }
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

    @Published var speakTrackNamesInVoiceover: Bool {
        didSet { defaults.set(speakTrackNamesInVoiceover, forKey: Keys.speakTrackNamesInVoiceover) }
    }

    @Published var spotifyClientId: String {
        didSet { defaults.set(spotifyClientId, forKey: Keys.spotifyClientId) }
    }

    @Published var spotifyRedirectURI: String {
        didSet { defaults.set(spotifyRedirectURI, forKey: Keys.spotifyRedirectURI) }
    }

    @Published var storyNarrator: StoryNarrator {
        didSet { defaults.set(storyNarrator.rawValue, forKey: Keys.storyNarrator) }
    }

    @Published var ttsVoice: TtsVoice {
        didSet { defaults.set(ttsVoice.rawValue, forKey: Keys.ttsVoice) }
    }

    @Published var edgeVoicePreset: EdgeVoicePreset {
        didSet { defaults.set(edgeVoicePreset.rawValue, forKey: Keys.edgeVoicePreset) }
    }

    @Published var storyLength: StoryLength {
        didSet { defaults.set(storyLength.rawValue, forKey: Keys.storyLength) }
    }

    @Published var serverTtsProvider: ServerTtsProvider {
        didSet { defaults.set(serverTtsProvider.rawValue, forKey: Keys.serverTtsProvider) }
    }

    /// Тариф с сервера (quota/profile) — источник правды для TTS, не только локальный профиль.
    @Published var serverTier: String? {
        didSet { defaults.set(serverTier, forKey: Keys.serverTier) }
    }

    @Published var accountProfile: AccountProfile? {
        didSet { persistAccountProfile() }
    }

    @Published var offlineAudioCacheEnabled: Bool {
        didSet { defaults.set(offlineAudioCacheEnabled, forKey: Keys.offlineAudioCacheEnabled) }
    }

    @Published var offlinePackPhase: String {
        didSet { defaults.set(offlinePackPhase, forKey: Keys.offlinePackPhase) }
    }

    @Published var offlinePackSessionId: Int64 {
        didSet { defaults.set(offlinePackSessionId, forKey: Keys.offlinePackSessionId) }
    }

    @Published var factNotificationsEnabled: Bool {
        didSet { defaults.set(factNotificationsEnabled, forKey: Keys.factNotificationsEnabled) }
    }

    @Published var shazamAutoDetectEnabled: Bool {
        didSet { defaults.set(shazamAutoDetectEnabled, forKey: Keys.shazamAutoDetectEnabled) }
    }

    @Published var appLanguage: AppLanguage {
        didSet { defaults.set(appLanguage.rawValue, forKey: Keys.appLanguage) }
    }

    var resolvedLanguage: ResolvedAppLanguage {
        resolveAppLanguage(appLanguage)
    }

    private init() {
        Self.migrateOnboardingIfNeeded(defaults: defaults)
        let storedBackend = defaults.string(forKey: Keys.backendURL) ?? SettingsDefaults.backendURL
        let normalizedBackend = BackendURL.normalize(storedBackend)
        if normalizedBackend != storedBackend {
            defaults.set(normalizedBackend, forKey: Keys.backendURL)
        }
        backendURL = normalizedBackend
        manualMode = defaults.bool(forKey: Keys.manualMode)
        onboardingComplete = defaults.bool(forKey: Keys.onboardingComplete)
        triggerMode = TriggerMode(rawValue: defaults.string(forKey: Keys.triggerMode) ?? "") ?? .everyNTracks
        everyNTracks = defaults.object(forKey: Keys.everyNTracks) as? Int ?? SettingsDefaults.everyNTracks
        sameTrackStoryEveryN = defaults.object(forKey: Keys.sameTrackStoryEveryN) as? Int ?? SettingsDefaults.sameTrackStoryEveryN
        if let presetId = defaults.string(forKey: Keys.ttsSpeedPreset) {
            ttsSpeedPreset = TtsSpeed.fromId(presetId)
        } else if let legacySpeed = defaults.object(forKey: Keys.ttsSpeed) as? Float {
            ttsSpeedPreset = TtsSpeed.fromLegacyFloat(legacySpeed)
        } else {
            ttsSpeedPreset = SettingsDefaults.ttsSpeedPreset
        }
        ttsEmotion = TtsEmotion.fromId(defaults.string(forKey: Keys.ttsEmotion))
        musicFadeSeconds = defaults.object(forKey: Keys.musicFadeSeconds) as? Float ?? SettingsDefaults.musicFadeSeconds
        specificArtists = defaults.stringArray(forKey: Keys.specificArtists) ?? []
        specificGenres = defaults.stringArray(forKey: Keys.specificGenres) ?? []
        autoIntercept = defaults.object(forKey: Keys.autoIntercept) as? Bool ?? true
        speakTrackNamesInVoiceover = defaults.object(forKey: Keys.speakTrackNamesInVoiceover) as? Bool
            ?? SettingsDefaults.speakTrackNamesInVoiceover
        spotifyClientId = defaults.string(forKey: Keys.spotifyClientId) ?? ""
        spotifyRedirectURI = defaults.string(forKey: Keys.spotifyRedirectURI) ?? SettingsDefaults.spotifyRedirectURI
        storyNarrator = StoryNarrator.fromId(defaults.string(forKey: Keys.storyNarrator))
        ttsVoice = TtsVoice.fromId(defaults.string(forKey: Keys.ttsVoice))
        edgeVoicePreset = EdgeVoicePreset.fromId(defaults.string(forKey: Keys.edgeVoicePreset))
        storyLength = StoryLength.fromId(defaults.string(forKey: Keys.storyLength))
        serverTtsProvider = ServerTtsProvider.fromId(defaults.string(forKey: Keys.serverTtsProvider))
        serverTier = defaults.string(forKey: Keys.serverTier)
        offlineAudioCacheEnabled = defaults.object(forKey: Keys.offlineAudioCacheEnabled) as? Bool ?? false
        offlinePackPhase = defaults.string(forKey: Keys.offlinePackPhase) ?? OfflinePackPhase.idle.rawValue
        offlinePackSessionId = Int64(defaults.object(forKey: Keys.offlinePackSessionId) as? Int ?? 0)
        factNotificationsEnabled = defaults.object(forKey: Keys.factNotificationsEnabled) as? Bool ?? true
        shazamAutoDetectEnabled = defaults.object(forKey: Keys.shazamAutoDetectEnabled) as? Bool ?? true
        appLanguage = AppLanguage.fromId(defaults.string(forKey: Keys.appLanguage))
        accountProfile = loadAccountProfile()
    }

    func migratePlaybackCacheIfNeeded() {
        let marker = defaults.integer(forKey: Keys.playbackCachePurgeVersion)
        guard marker < Self.playbackCachePurgeTarget else { return }
        OfflineAudioStore.shared.wipeAll()
        offlineAudioCacheEnabled = false
        defaults.set(Self.playbackCachePurgeTarget, forKey: Keys.playbackCachePurgeVersion)
    }

    /// Сброс онбординга при крупном обновлении потока входа (v3: Shazam / плееры iOS).
    private static func migrateOnboardingIfNeeded(defaults: UserDefaults) {
        let currentVersion = 3
        if defaults.integer(forKey: Keys.onboardingVersion) < currentVersion {
            defaults.set(false, forKey: Keys.onboardingComplete)
            defaults.set(currentVersion, forKey: Keys.onboardingVersion)
        }
    }

    func saveAccountProfile(_ profile: AccountProfile) {
        accountProfile = profile
    }

    func clearAccountProfile() {
        accountProfile = nil
    }

    private func persistAccountProfile() {
        guard let accountProfile else {
            defaults.removeObject(forKey: Keys.accountProfile)
            return
        }
        if let data = try? JSONEncoder().encode(accountProfile) {
            defaults.set(data, forKey: Keys.accountProfile)
        }
    }

    private func loadAccountProfile() -> AccountProfile? {
        guard let data = defaults.data(forKey: Keys.accountProfile) else { return nil }
        return try? JSONDecoder().decode(AccountProfile.self, from: data)
    }

    /// Client ID из сборки (Info.plist) или ручной ввод в UserDefaults.
    var effectiveSpotifyClientId: String {
        if let raw = Bundle.main.object(forInfoDictionaryKey: "SpotifyClientID") as? String {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty, !trimmed.hasPrefix("$("), !trimmed.contains("your_spotify") {
                return trimmed
            }
        }
        return spotifyClientId.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var effectiveSpotifyRedirectURI: String {
        let trimmed = spotifyRedirectURI.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? SettingsDefaults.spotifyRedirectURI : trimmed
    }

    var hasSpotifyClientId: Bool {
        !effectiveSpotifyClientId.isEmpty
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

    /// Один переключатель как на Android: вкл = автоперехват, выкл = ручной режим.
    func setAutoPlaybackMode(_ autoEnabled: Bool) {
        autoIntercept = autoEnabled
        manualMode = !autoEnabled
    }

    var effectiveServerTier: String {
        if let serverTier, !serverTier.isEmpty {
            return serverTier.lowercased()
        }
        return resolvedAccountTier
    }

    private var resolvedAccountTier: String {
        guard let profile = accountProfile, profile.isLoggedIn else { return "free" }
        let plan = profile.plan?.lowercased() ?? "free"
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        switch plan {
        case "trial":
            if let until = profile.trialUntil, until > now { return "trial" }
            return "free"
        case "premium":
            if let until = profile.premiumUntil, until > now { return "premium" }
            return "free"
        case "unlimited":
            return "unlimited"
        default:
            return plan
        }
    }

    var hasPremiumTtsAccess: Bool {
        switch effectiveServerTier {
        case "trial", "premium", "unlimited":
            return true
        default:
            return false
        }
    }

    var effectiveServerTtsProvider: ServerTtsProvider {
        hasPremiumTtsAccess ? serverTtsProvider : .edge
    }
}
