import Foundation
import SwiftData

@Model
final class CachedStoryEntry {
    @Attribute(.unique) var trackKey: String
    var artist: String
    var title: String
    var script: String
    var audioUrl: String?
    var localAudioPath: String?
    var demo: Bool
    var fetchedAt: Date

    init(
        trackKey: String,
        artist: String,
        title: String,
        script: String,
        audioUrl: String? = nil,
        localAudioPath: String? = nil,
        demo: Bool = false,
        fetchedAt: Date = .now
    ) {
        self.trackKey = trackKey
        self.artist = artist
        self.title = title
        self.script = script
        self.audioUrl = audioUrl
        self.localAudioPath = localAudioPath
        self.demo = demo
        self.fetchedAt = fetchedAt
    }
}

@Model
final class StoryHistoryEntry {
    @Attribute(.unique) var id: UUID
    var serverId: String?
    var artist: String
    var title: String
    var trackKey: String
    var script: String
    var year: Int?
    var genre: String?
    var demo: Bool
    var vote: String?
    var createdAt: Date

    init(
        artist: String,
        title: String,
        trackKey: String,
        script: String,
        serverId: String? = nil,
        year: Int? = nil,
        genre: String? = nil,
        demo: Bool = false,
        vote: String? = nil,
        createdAt: Date = .now
    ) {
        self.id = UUID()
        self.serverId = serverId
        self.artist = artist
        self.title = title
        self.trackKey = trackKey
        self.script = script
        self.year = year
        self.genre = genre
        self.demo = demo
        self.vote = vote
        self.createdAt = createdAt
    }
}

@Model
final class ScrobbleEntry {
    @Attribute(.unique) var id: UUID
    var serverId: String?
    var artist: String
    var title: String
    var trackKey: String
    var sourceRaw: String
    var storyTriggered: Bool
    var scrobbledAt: Date

    init(
        artist: String,
        title: String,
        trackKey: String,
        source: TrackSource,
        serverId: String? = nil,
        storyTriggered: Bool = false,
        scrobbledAt: Date = .now
    ) {
        self.id = UUID()
        self.serverId = serverId
        self.artist = artist
        self.title = title
        self.trackKey = trackKey
        self.sourceRaw = source.rawValue
        self.storyTriggered = storyTriggered
        self.scrobbledAt = scrobbledAt
    }

    var source: TrackSource {
        TrackSource(rawValue: sourceRaw) ?? .manual
    }
}

enum StoryHistoryModel {
    static let container: ModelContainer = {
        do {
            return try ModelContainer(
                for: StoryHistoryEntry.self,
                ScrobbleEntry.self,
                CachedStoryEntry.self,
                OfflinePackEntry.self
            )
        } catch {
            fatalError("SwiftData init failed: \(error)")
        }
    }()
}

@MainActor
final class StoryHistoryStore {
    static let shared = StoryHistoryStore()

    static var modelContainer: ModelContainer { StoryHistoryModel.container }

    var context: ModelContext { Self.modelContainer.mainContext }

    private init() {}

    func recentScripts(for trackKey: String, limit: Int = 8) -> [String] {
        var descriptor = FetchDescriptor<StoryHistoryEntry>(
            predicate: #Predicate { $0.trackKey == trackKey },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        descriptor.fetchLimit = limit
        return (try? context.fetch(descriptor))?.map(\.script) ?? []
    }

    func saveStory(_ response: StoryResponse, track: TrackInfo) {
        let serverId = SettingsStore.shared.accountProfile?.isLoggedIn == true
            ? UUID().uuidString.lowercased()
            : nil
        let entry = StoryHistoryEntry(
            artist: response.artist,
            title: response.title,
            trackKey: track.displayKey,
            script: response.script,
            serverId: serverId,
            year: response.year,
            genre: response.genre,
            demo: response.demo
        )
        context.insert(entry)
        try? context.save()
        AccountCloudSync.pushHistoryInBackground(entry)
    }

    func cachedStory(for trackKey: String) -> CachedStoryEntry? {
        var descriptor = FetchDescriptor<CachedStoryEntry>(
            predicate: #Predicate { $0.trackKey == trackKey }
        )
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    func upsertCachedStory(
        trackKey: String,
        response: StoryResponse,
        localAudioPath: String?
    ) {
        if let existing = cachedStory(for: trackKey) {
            existing.artist = response.artist
            existing.title = response.title
            existing.script = response.script
            existing.audioUrl = response.audioUrl
            existing.localAudioPath = localAudioPath ?? existing.localAudioPath
            existing.demo = response.demo
            existing.fetchedAt = .now
        } else {
            context.insert(
                CachedStoryEntry(
                    trackKey: trackKey,
                    artist: response.artist,
                    title: response.title,
                    script: response.script,
                    audioUrl: response.audioUrl,
                    localAudioPath: localAudioPath,
                    demo: response.demo
                )
            )
        }
        try? context.save()
    }

    func updateLocalAudioPath(trackKey: String, path: String) {
        guard let cached = cachedStory(for: trackKey) else { return }
        cached.localAudioPath = path
        try? context.save()
    }

    func cachedStoriesMissingLocalAudio() -> [CachedStoryEntry] {
        let descriptor = FetchDescriptor<CachedStoryEntry>()
        return (try? context.fetch(descriptor))?.filter {
            ($0.localAudioPath ?? "").isEmpty && !($0.audioUrl ?? "").isEmpty
        } ?? []
    }

    func hasVoteForStory(trackKey: String, script: String) -> Bool {
        var descriptor = FetchDescriptor<StoryHistoryEntry>(
            predicate: #Predicate { $0.trackKey == trackKey && $0.script == script && $0.vote != nil }
        )
        descriptor.fetchLimit = 1
        return ((try? context.fetch(descriptor))?.isEmpty == false)
    }

    func updateVote(trackKey: String, script: String, vote: String) {
        var descriptor = FetchDescriptor<StoryHistoryEntry>(
            predicate: #Predicate { $0.trackKey == trackKey && $0.script == script },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        guard let entry = try? context.fetch(descriptor).first else { return }
        entry.vote = vote
        try? context.save()
    }

    func logScrobble(_ track: TrackInfo, storyTriggered: Bool) {
        let serverId = SettingsStore.shared.accountProfile?.isLoggedIn == true
            ? UUID().uuidString.lowercased()
            : nil
        let entry = ScrobbleEntry(
            artist: track.artist,
            title: track.title,
            trackKey: track.displayKey,
            source: track.source,
            serverId: serverId,
            storyTriggered: storyTriggered
        )
        context.insert(entry)
        try? context.save()
        AccountCloudSync.pushScrobbleInBackground(entry)
    }

    func wasRecentlyScrobbled(_ trackKey: String, within seconds: TimeInterval = 30) -> Bool {
        let cutoff = Date().addingTimeInterval(-seconds)
        var descriptor = FetchDescriptor<ScrobbleEntry>(
            predicate: #Predicate { $0.trackKey == trackKey && $0.scrobbledAt >= cutoff },
            sortBy: [SortDescriptor(\.scrobbledAt, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        return ((try? context.fetch(descriptor))?.isEmpty == false)
    }

    func allRecentHistory(limit: Int = 500) -> [StoryHistoryEntry] {
        var descriptor = FetchDescriptor<StoryHistoryEntry>(
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        descriptor.fetchLimit = limit
        return (try? context.fetch(descriptor)) ?? []
    }

    func allRecentScrobbles(limit: Int = 500) -> [ScrobbleEntry] {
        var descriptor = FetchDescriptor<ScrobbleEntry>(
            sortBy: [SortDescriptor(\.scrobbledAt, order: .reverse)]
        )
        descriptor.fetchLimit = limit
        return (try? context.fetch(descriptor)) ?? []
    }

    func mergeHistoryEntries(_ remote: [CloudStoryHistoryEntry]) {
        for entry in remote {
            insertHistoryIfNew(entry)
        }
        try? context.save()
    }

    func mergeScrobbleEntries(_ remote: [CloudScrobbleEntry]) {
        for entry in remote {
            insertScrobbleIfNew(entry)
        }
        try? context.save()
    }

    func dedupeStoryHistory() {
        let entries = allRecentHistory(limit: 2_000)
        var seen = Set<String>()
        for entry in entries {
            let key = "\(entry.trackKey)|\(entry.script)|\(Int(entry.createdAt.timeIntervalSince1970 / 60))"
            if seen.contains(key) {
                context.delete(entry)
            } else {
                seen.insert(key)
            }
        }
        try? context.save()
    }

    func dedupeListeningHistory() {
        let entries = allRecentScrobbles(limit: 2_000)
        guard entries.count > 1 else { return }
        let window: TimeInterval = 20 * 60
        var toDelete = Set<UUID>()
        let grouped = Dictionary(grouping: entries, by: \.trackKey)
        for group in grouped.values {
            let sorted = group.sorted { $0.scrobbledAt > $1.scrobbledAt }
            var processed = Set<UUID>()
            for entry in sorted where !processed.contains(entry.id) {
                let cluster = sorted.filter {
                    !processed.contains($0.id) &&
                        abs($0.scrobbledAt.timeIntervalSince(entry.scrobbledAt)) <= window
                }
                guard cluster.count > 1 else {
                    processed.insert(entry.id)
                    continue
                }
                let keep = cluster.sorted {
                    if $0.storyTriggered != $1.storyTriggered { return $0.storyTriggered && !$1.storyTriggered }
                    return $0.scrobbledAt < $1.scrobbledAt
                }.first
                for duplicate in cluster where duplicate.id != keep?.id {
                    toDelete.insert(duplicate.id)
                    processed.insert(duplicate.id)
                }
                if let keep { processed.insert(keep.id) }
            }
        }
        for entry in entries where toDelete.contains(entry.id) {
            context.delete(entry)
        }
        try? context.save()
    }

    private func insertHistoryIfNew(_ remote: CloudStoryHistoryEntry) {
        if let existing = findHistory(trackKey: remote.trackKey, script: remote.script) {
            mergeHistoryVoteAndServerId(existing: existing, remote: remote)
            return
        }
        if let serverId = remote.serverId, let existing = findHistory(serverId: serverId) {
            mergeHistoryVoteAndServerId(existing: existing, remote: remote)
            return
        }
        let playedAt = Date(timeIntervalSince1970: TimeInterval(remote.playedAtMs) / 1000)
        if countHistory(trackKey: remote.trackKey, playedAt: playedAt) > 0 { return }
        context.insert(
            StoryHistoryEntry(
                artist: remote.artist,
                title: remote.title,
                trackKey: remote.trackKey,
                script: remote.script,
                serverId: remote.serverId,
                vote: remote.vote,
                createdAt: playedAt
            )
        )
    }

    private func insertScrobbleIfNew(_ remote: CloudScrobbleEntry) {
        if let serverId = remote.serverId, countScrobble(serverId: serverId) > 0 { return }
        let playedAt = Date(timeIntervalSince1970: TimeInterval(remote.scrobbledAtMs) / 1000)
        if countScrobble(artist: remote.artist, title: remote.title, playedAt: playedAt) > 0 { return }
        context.insert(
            ScrobbleEntry(
                artist: remote.artist,
                title: remote.title,
                trackKey: remote.trackKey,
                source: .manual,
                serverId: remote.serverId,
                storyTriggered: remote.storyTriggered,
                scrobbledAt: playedAt
            )
        )
    }

    private func mergeHistoryVoteAndServerId(existing: StoryHistoryEntry, remote: CloudStoryHistoryEntry) {
        if let vote = remote.vote, !vote.isEmpty, existing.vote != vote {
            existing.vote = vote
        }
        if let serverId = remote.serverId, !serverId.isEmpty, (existing.serverId ?? "").isEmpty {
            if findHistory(serverId: serverId) == nil {
                existing.serverId = serverId
            }
        }
    }

    private func findHistory(trackKey: String, script: String) -> StoryHistoryEntry? {
        var descriptor = FetchDescriptor<StoryHistoryEntry>(
            predicate: #Predicate { $0.trackKey == trackKey && $0.script == script },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    private func findHistory(serverId: String) -> StoryHistoryEntry? {
        var descriptor = FetchDescriptor<StoryHistoryEntry>(
            predicate: #Predicate { $0.serverId == serverId }
        )
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    private func countHistory(trackKey: String, playedAt: Date) -> Int {
        let ms = Int64(playedAt.timeIntervalSince1970 * 1000)
        let entries = allRecentHistory(limit: 2_000).filter { $0.trackKey == trackKey }
        return entries.filter { Int64($0.createdAt.timeIntervalSince1970 * 1000) == ms }.count
    }

    private func countScrobble(serverId: String) -> Int {
        allRecentScrobbles(limit: 2_000).filter { $0.serverId == serverId }.count
    }

    private func countScrobble(artist: String, title: String, playedAt: Date) -> Int {
        let ms = Int64(playedAt.timeIntervalSince1970 * 1000)
        return allRecentScrobbles(limit: 2_000).filter {
            $0.artist == artist && $0.title == title &&
                Int64($0.scrobbledAt.timeIntervalSince1970 * 1000) == ms
        }.count
    }
}

extension StoryHistoryEntry {
    func syncPayload() -> [String: Any] {
        var body: [String: Any] = [
            "id": serverId ?? "",
            "trackKey": trackKey,
            "artist": artist,
            "title": title,
            "script": script,
            "playedAt": Int64(createdAt.timeIntervalSince1970 * 1000),
        ]
        if let vote, !vote.isEmpty {
            body["vote"] = vote
        }
        return body
    }
}

extension ScrobbleEntry {
    func syncPayload() -> [String: Any] {
        [
            "id": serverId ?? "",
            "artist": artist,
            "title": title,
            "scrobbledAt": Int64(scrobbledAt.timeIntervalSince1970 * 1000),
            "storyTriggered": storyTriggered,
        ]
    }
}
