import Foundation

struct CloudStoryHistoryEntry: Sendable {
    let serverId: String?
    let trackKey: String
    let artist: String
    let title: String
    let script: String
    let playedAtMs: Int64
    let vote: String?
    let storyNarrator: String?
    let seedScope: String?
}

struct CloudScrobbleEntry: Sendable {
    let serverId: String?
    let artist: String
    let title: String
    let trackKey: String
    let storyTriggered: Bool
    let scrobbledAtMs: Int64
}

enum CloudHistoryMapper {
    static func parseStoryHistory(_ json: [String: Any]) -> [CloudStoryHistoryEntry] {
        guard let arr = json["history"] as? [[String: Any]] else { return [] }
        return arr.compactMap(parseStoryHistoryItem)
    }

    static func parseScrobbles(_ json: [String: Any]) -> [CloudScrobbleEntry] {
        guard let arr = json["scrobbles"] as? [[String: Any]] else { return [] }
        return arr.compactMap(parseScrobbleItem)
    }

    static func parseStoryHistoryItem(_ item: [String: Any]) -> CloudStoryHistoryEntry? {
        let artist = (item["artist"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let title = (item["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let script = (item["script"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !artist.isEmpty, !title.isEmpty, !script.isEmpty else { return nil }

        let trackKeyRaw = (item["trackKey"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let trackKey = trackKeyRaw.isEmpty ? "\(artist.lowercased())|\(title.lowercased())" : trackKeyRaw
        let serverId = (item["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        let playedAtMs = int64(item["playedAt"]) ?? Int64(Date().timeIntervalSince1970 * 1000)
        let vote = (item["vote"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        let storyNarrator = (item["storyNarrator"] as? String ?? item["story_narrator"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        let seedScope = (item["seedScope"] as? String ?? item["seed_scope"] as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty

        return CloudStoryHistoryEntry(
            serverId: serverId,
            trackKey: trackKey,
            artist: artist,
            title: title,
            script: script,
            playedAtMs: playedAtMs,
            vote: vote,
            storyNarrator: storyNarrator,
            seedScope: seedScope
        )
    }

    static func parseScrobbleItem(_ item: [String: Any]) -> CloudScrobbleEntry? {
        let artist = (item["artist"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let title = (item["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !artist.isEmpty, !title.isEmpty else { return nil }

        let serverId = (item["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        let scrobbledAtMs = int64(item["scrobbledAt"]) ?? Int64(Date().timeIntervalSince1970 * 1000)
        return CloudScrobbleEntry(
            serverId: serverId,
            artist: artist,
            title: title,
            trackKey: "\(artist.lowercased())|\(title.lowercased())",
            storyTriggered: item["storyTriggered"] as? Bool ?? false,
            scrobbledAtMs: scrobbledAtMs
        )
    }

    private static func int64(_ value: Any?) -> Int64? {
        if let n = value as? Int64 { return n }
        if let n = value as? Int { return Int64(n) }
        if let n = value as? NSNumber { return n.int64Value }
        if let s = value as? String, let n = Int64(s) { return n }
        return nil
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
