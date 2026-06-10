import Foundation

struct StoryHistoryEntry: Identifiable, Codable {
    var id: UUID
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

struct ScrobbleEntry: Identifiable, Codable {
    var id: UUID
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

private struct StoryHistorySnapshot: Codable {
    var stories: [StoryHistoryEntry]
    var scrobbles: [ScrobbleEntry]
}

@MainActor
final class StoryHistoryStore: ObservableObject {
    static let shared = StoryHistoryStore()

    @Published private(set) var stories: [StoryHistoryEntry] = []
    @Published private(set) var scrobbles: [ScrobbleEntry] = []

    private let fileURL: URL
    private let maxEntries = 500

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("MusicStory", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("history.json")
        load()
    }

    func recentScripts(for trackKey: String, limit: Int = 8) -> [String] {
        stories
            .filter { $0.trackKey == trackKey }
            .sorted { $0.createdAt > $1.createdAt }
            .prefix(limit)
            .map(\.script)
    }

    func saveStory(_ response: StoryResponse, track: TrackInfo) {
        stories.insert(
            StoryHistoryEntry(
                artist: response.artist,
                title: response.title,
                trackKey: track.displayKey,
                script: response.script,
                year: response.year,
                genre: response.genre,
                demo: response.demo
            ),
            at: 0
        )
        trimAndPersist()
    }

    func logScrobble(_ track: TrackInfo, storyTriggered: Bool) {
        scrobbles.insert(
            ScrobbleEntry(
                artist: track.artist,
                title: track.title,
                trackKey: track.displayKey,
                source: track.source,
                storyTriggered: storyTriggered
            ),
            at: 0
        )
        trimAndPersist()
    }

    func hasVoteForStory(trackKey: String, script: String) -> Bool {
        stories.contains { $0.trackKey == trackKey && $0.script == script && $0.vote != nil }
    }

    func findLatestEntry(trackKey: String, script: String) -> StoryHistoryEntry? {
        stories.first { $0.trackKey == trackKey && $0.script == script }
            ?? stories.first { $0.trackKey == trackKey }
    }

    func updateVote(trackKey: String, script: String, vote: String) {
        guard let index = stories.firstIndex(where: { $0.trackKey == trackKey && $0.script == script })
            ?? stories.firstIndex(where: { $0.trackKey == trackKey }) else { return }
        stories[index].vote = vote
        persist()
    }

    func wasRecentlyScrobbled(_ trackKey: String, within seconds: TimeInterval = 30) -> Bool {
        let cutoff = Date().addingTimeInterval(-seconds)
        return scrobbles.contains { $0.trackKey == trackKey && $0.scrobbledAt >= cutoff }
    }

    private func trimAndPersist() {
        if stories.count > maxEntries {
            stories = Array(stories.prefix(maxEntries))
        }
        if scrobbles.count > maxEntries {
            scrobbles = Array(scrobbles.prefix(maxEntries))
        }
        persist()
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let snapshot = try? JSONDecoder().decode(StoryHistorySnapshot.self, from: data) else {
            return
        }
        stories = snapshot.stories
        scrobbles = snapshot.scrobbles
    }

    private func persist() {
        let snapshot = StoryHistorySnapshot(stories: stories, scrobbles: scrobbles)
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
