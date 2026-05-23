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
