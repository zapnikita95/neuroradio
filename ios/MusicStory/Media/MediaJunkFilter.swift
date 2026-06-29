import Foundation

/// Non-music playback metadata (voice messages, messenger audio) — not valid tracks.
enum MediaJunkFilter {
    private static let voiceMessagePatterns: [String] = [
        "voice message",
        "voice note",
        "voice msg",
        "audio message",
        "vocal message",
        "video message",
        "голосовое сообщение",
        "голосовое",
        "голосовая заметка",
        "аудиосообщение",
        "аудио сообщение",
        "аудиозаметка",
    ]

    static func isNonMusicPlaybackMetadata(artist: String, title: String) -> Bool {
        matchesVoiceMessagePattern(artist) || matchesVoiceMessagePattern(title)
    }

    private static func matchesVoiceMessagePattern(_ value: String) -> Bool {
        let normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        guard !normalized.isEmpty else { return false }
        return voiceMessagePatterns.contains { pattern in
            normalized == pattern || normalized.hasPrefix("\(pattern) ")
        }
    }
}
