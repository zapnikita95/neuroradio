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
        year: Int? = nil,
        genre: String? = nil,
        demo: Bool = false,
        vote: String? = nil,
        createdAt: Date = .now
    ) {
        self.id = UUID()
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
        storyTriggered: Bool = false,
        scrobbledAt: Date = .now
    ) {
        self.id = UUID()
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
        let entry = StoryHistoryEntry(
            artist: response.artist,
            title: response.title,
            trackKey: track.displayKey,
            script: response.script,
            year: response.year,
            genre: response.genre,
            demo: response.demo
        )
        context.insert(entry)
        try? context.save()
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
        let entry = ScrobbleEntry(
            artist: track.artist,
            title: track.title,
            trackKey: track.displayKey,
            source: track.source,
            storyTriggered: storyTriggered
        )
        context.insert(entry)
        try? context.save()
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
}
