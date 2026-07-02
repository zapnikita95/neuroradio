import Foundation

enum StoryShareText {
    static func normalizeUserFacingTranscript(_ text: String) -> String {
        text
            .replacingOccurrences(of: "й+утй+уб", with: "YouTube", options: .caseInsensitive)
            .replacingOccurrences(of: "ют+уб", with: "YouTube", options: .caseInsensitive)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func resolveVoicedText(script: String, ttsTranscript: String?) -> String {
        let raw = ttsTranscript?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? ttsTranscript!
            : script
        return normalizeUserFacingTranscript(raw)
    }

    static func resolveVoicedText(_ response: StoryResponse) -> String {
        resolveVoicedText(script: response.script, ttsTranscript: response.ttsTranscript)
    }

    static func excerpt(_ text: String, maxChars: Int = 280) -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.count <= maxChars { return t }
        let cut = String(t.prefix(maxChars))
        if let dot = cut.lastIndex(of: "."), cut.distance(from: cut.startIndex, to: dot) > maxChars / 3 {
            return String(cut[...dot]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
        }
        if let space = cut.lastIndex(of: " ") {
            return String(cut[..<space]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
        }
        return cut + "…"
    }

    static func plainShareMessage(artist: String, title: String, voicedText: String) -> String {
        """
        \(title) — \(artist)

        \(voicedText.trimmingCharacters(in: .whitespacesAndNewlines))

        — Эфир AI · https://www.efir-ai.ru
        """
    }

    static func cardVariantSeed(trackKey: String, playedAt: TimeInterval) -> Int {
        let hash = (trackKey + String(Int(playedAt))).hashValue
        return abs(hash) % 4
    }
}

extension StoryHistoryEntry {
    var displayVoicedText: String {
        let v = voicedText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return v.isEmpty ? script : v
    }
}
