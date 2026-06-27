import Foundation

struct StoryRequest: Encodable, Sendable {
    let artist: String
    let title: String
    let previousScripts: [String]
    let storyLength: String
    let storyNarrator: String
    let ttsVoice: String
    let ttsSpeed: Float
    let ttsEmotion: String
    let clientPlatform: String
    let ttsProvider: String?
    let edgeVoicePreset: String?
    let elevenLabsVoice: String?
    let speakTrackNamesInVoiceover: Bool
    let lang: String?
    let deviceFingerprint: String?

    enum CodingKeys: String, CodingKey {
        case artist
        case title
        case previousScripts = "previous_scripts"
        case storyLength = "story_length"
        case storyNarrator = "story_narrator"
        case ttsVoice = "tts_voice"
        case ttsSpeed = "tts_speed"
        case ttsEmotion = "tts_emotion"
        case clientPlatform = "client_platform"
        case ttsProvider = "tts_provider"
        case edgeVoicePreset = "edge_voice_preset"
        case elevenLabsVoice = "elevenlabs_voice"
        case speakTrackNamesInVoiceover = "speak_track_names_in_voiceover"
        case lang
        case deviceFingerprint = "device_fingerprint"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(artist, forKey: .artist)
        try container.encode(title, forKey: .title)
        try container.encode(previousScripts, forKey: .previousScripts)
        try container.encode(storyLength, forKey: .storyLength)
        try container.encode(storyNarrator, forKey: .storyNarrator)
        try container.encode(ttsVoice, forKey: .ttsVoice)
        try container.encode(ttsSpeed, forKey: .ttsSpeed)
        try container.encode(ttsEmotion, forKey: .ttsEmotion)
        try container.encode(clientPlatform, forKey: .clientPlatform)
        try container.encodeIfPresent(ttsProvider, forKey: .ttsProvider)
        try container.encodeIfPresent(edgeVoicePreset, forKey: .edgeVoicePreset)
        try container.encodeIfPresent(elevenLabsVoice, forKey: .elevenLabsVoice)
        try container.encode(speakTrackNamesInVoiceover, forKey: .speakTrackNamesInVoiceover)
        try container.encodeIfPresent(lang, forKey: .lang)
        try container.encodeIfPresent(deviceFingerprint, forKey: .deviceFingerprint)
    }
}

struct StoryResponse: Decodable, Sendable {
    let artist: String
    let title: String
    let year: Int?
    let genre: String?
    let mbid: String?
    let script: String
    let wordCount: Int
    let voiceId: String?
    let demo: Bool
    let audioUrl: String?
    let audioFile: String?
    let ttsHint: String?
    let quota: StoryQuotaInfo?
    let seedFact: String?
    let seedScope: String?
    let seedInterestScore: Int?
    let seedInterestRating: Int?
    let ttsTranscript: String?
    let ttsProvider: String?
    let welcomeTrial: WelcomeTrialInfo?
    let welcomeTrialEligible: Bool?
    let tier: String?

    enum CodingKeys: String, CodingKey {
        case artist
        case title
        case year
        case genre
        case mbid
        case script
        case wordCount = "word_count"
        case voiceId
        case demo
        case audioUrl
        case audioFile
        case ttsHint
        case quota
        case seedFact = "seed_fact"
        case seedScope = "seed_scope"
        case seedInterestScore = "seed_interest_score"
        case seedInterestRating = "seed_interest_rating"
        case ttsTranscript = "tts_transcript"
        case ttsProvider = "tts_provider"
        case welcomeTrial = "welcome_trial"
        case welcomeTrialEligible = "welcome_trial_eligible"
        case tier
    }

    init(
        artist: String,
        title: String,
        year: Int?,
        genre: String?,
        mbid: String?,
        script: String,
        wordCount: Int,
        voiceId: String?,
        demo: Bool,
        audioUrl: String?,
        audioFile: String?,
        ttsHint: String?,
        quota: StoryQuotaInfo?,
        seedFact: String? = nil,
        seedScope: String? = nil,
        seedInterestScore: Int? = nil,
        seedInterestRating: Int? = nil,
        ttsTranscript: String? = nil,
        ttsProvider: String? = nil,
        welcomeTrial: WelcomeTrialInfo? = nil,
        welcomeTrialEligible: Bool? = nil,
        tier: String? = nil
    ) {
        self.artist = artist
        self.title = title
        self.year = year
        self.genre = genre
        self.mbid = mbid
        self.script = script
        self.wordCount = wordCount
        self.voiceId = voiceId
        self.demo = demo
        self.audioUrl = audioUrl
        self.audioFile = audioFile
        self.ttsHint = ttsHint
        self.quota = quota
        self.seedFact = seedFact
        self.seedScope = seedScope
        self.seedInterestScore = seedInterestScore
        self.seedInterestRating = seedInterestRating
        self.ttsTranscript = ttsTranscript
        self.ttsProvider = ttsProvider
        self.welcomeTrial = welcomeTrial
        self.welcomeTrialEligible = welcomeTrialEligible
        self.tier = tier
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        artist = try container.decode(String.self, forKey: .artist)
        title = try container.decode(String.self, forKey: .title)
        year = try container.decodeIfPresent(Int.self, forKey: .year)
        genre = try container.decodeIfPresent(String.self, forKey: .genre)
        mbid = try container.decodeIfPresent(String.self, forKey: .mbid)
        script = try container.decode(String.self, forKey: .script)
        wordCount = try container.decodeIfPresent(Int.self, forKey: .wordCount) ?? script.split(separator: " ").count
        voiceId = try container.decodeIfPresent(String.self, forKey: .voiceId)
        demo = try container.decodeIfPresent(Bool.self, forKey: .demo) ?? false
        audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
        audioFile = try container.decodeIfPresent(String.self, forKey: .audioFile)
        ttsHint = try container.decodeIfPresent(String.self, forKey: .ttsHint)
        quota = try container.decodeIfPresent(StoryQuotaInfo.self, forKey: .quota)
        seedFact = try container.decodeIfPresent(String.self, forKey: .seedFact)
        seedScope = try container.decodeIfPresent(String.self, forKey: .seedScope)
        seedInterestScore = try container.decodeIfPresent(Int.self, forKey: .seedInterestScore)
        seedInterestRating = try container.decodeIfPresent(Int.self, forKey: .seedInterestRating)
        ttsTranscript = try container.decodeIfPresent(String.self, forKey: .ttsTranscript)
        ttsProvider = try container.decodeIfPresent(String.self, forKey: .ttsProvider)
        welcomeTrial = try container.decodeIfPresent(WelcomeTrialInfo.self, forKey: .welcomeTrial)
        welcomeTrialEligible = try container.decodeIfPresent(Bool.self, forKey: .welcomeTrialEligible)
        tier = try container.decodeIfPresent(String.self, forKey: .tier)
    }

    var displayTranscript: String {
        let raw = (ttsTranscript?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
            ? ttsTranscript!
            : script
        return raw
            .replacingOccurrences(of: "й+утй+уб", with: "YouTube", options: .caseInsensitive)
            .replacingOccurrences(of: "ют+уб", with: "YouTube", options: .caseInsensitive)
    }
}

struct WelcomeTrialInfo: Decodable, Sendable {
    let granted: Bool
    let trialUntil: Int64?
    let plan: String?

    enum CodingKeys: String, CodingKey {
        case granted
        case trialUntil = "trial_until"
        case plan
    }
}

struct StoryQuotaInfo: Decodable, Sendable {
    let used: Int
    let limit: Int
    let remaining: Int
    let resetsAt: Int64?
}

struct QuotaResponse: Decodable, Sendable {
    let tier: String?
    let quota: StoryQuotaInfo
}

struct FactHintResponse: Decodable, Sendable {
    let hasHotFact: Bool
    let hotCount: Int
}

struct TokenResponse: Decodable, Sendable {
    let accessToken: String
    let tokenType: String?
    let expiresIn: Int

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
    }
}

struct HealthResponse: Decodable, Sendable {
    let status: String
    let service: String?
    let groq: Bool?
    let yandexTts: Bool?
    let appAuthRequired: Bool?
}

struct LanguageSwitchPolicy: Decodable, Sendable {
    let allowed: Bool
    let reason: String?
    let hintRu: String?
    let hintEn: String?
    let note: String?
}

struct LanguageSwitchBundle: Decodable, Sendable {
    let toRu: LanguageSwitchPolicy?
    let toEn: LanguageSwitchPolicy?
}

struct BillingEntitlement: Decodable, Sendable {
    let plan: String?
    let premiumUntil: Int64?
    let trialUntil: Int64?
    let subscriptionMarket: String?
    let billingProvider: String?
}

struct BillingStatusResponse: Decodable, Sendable {
    let tier: String?
    let premium: Bool?
    let entitlement: BillingEntitlement?
    let subscriptionMarket: String?
    let billingChannel: String?
    let languageSwitch: LanguageSwitchBundle?
    let devTierSwitchEnabled: Bool?
    let devTierOverride: String?
    let hint: String?
}

struct DevTierResponse: Decodable, Sendable {
    let ok: Bool?
    let tier: String?
    let devTierOverride: String?
    let hint: String?
    let error: String?
    let code: String?
}

struct AppStoreVerifyRequest: Encodable, Sendable {
    let receiptData: String
}

struct IapVerifyResponse: Decodable, Sendable {
    let ok: Bool?
    let tier: String?
    let subscriptionMarket: String?
    let hint: String?
    let error: String?
}

struct PaymentCreateRequest: Encodable, Sendable {
    let email: String
    let plan: String
}

struct PaymentCreateResponse: Decodable, Sendable {
    let ok: Bool?
    let confirmationUrl: String?
    let error: String?
}

struct StoryFeedbackRequest: Encodable, Sendable {
    let artist: String
    let title: String
    let vote: String
    let reason: String
    let reasons: [String]
    let script: String?
    let historyId: String?
    let story_narrator: String?
    let seed_fact: String?
    let genre: String?
    let year: Int?
    let lang: String?

    init(
        artist: String,
        title: String,
        vote: String,
        reason: String,
        reasons: [String],
        script: String?,
        historyId: String?,
        story_narrator: String? = nil,
        seed_fact: String? = nil,
        genre: String? = nil,
        year: Int? = nil,
        lang: String? = nil
    ) {
        self.artist = artist
        self.title = title
        self.vote = vote
        self.reason = reason
        self.reasons = reasons
        self.script = script
        self.historyId = historyId
        self.story_narrator = story_narrator
        self.seed_fact = seed_fact
        self.genre = genre
        self.year = year
        self.lang = lang
    }
}
