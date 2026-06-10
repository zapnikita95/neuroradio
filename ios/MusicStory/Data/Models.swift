import Foundation

struct StoryRequest: Encodable, Sendable {
    let artist: String
    let title: String
    let previousScripts: [String]
    let storyLength: String
    let ttsSpeed: Float
    let ttsEmotion: String

    enum CodingKeys: String, CodingKey {
        case artist
        case title
        case previousScripts = "previous_scripts"
        case storyLength = "story_length"
        case ttsSpeed = "tts_speed"
        case ttsEmotion = "tts_emotion"
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
        quota: StoryQuotaInfo?
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
