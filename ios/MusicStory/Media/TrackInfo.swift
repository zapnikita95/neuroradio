import Foundation

enum TrackSource: String, Codable, Sendable {
    case spotify
    case appleMusic
    case shazam
    case manual
}

struct TrackInfo: Equatable, Sendable {
    let artist: String
    let title: String
    let album: String?
    let source: TrackSource
    let durationMs: Int64

    init(
        artist: String,
        title: String,
        album: String? = nil,
        source: TrackSource,
        durationMs: Int64 = 0
    ) {
        self.artist = artist.trimmingCharacters(in: .whitespacesAndNewlines)
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        self.album = album?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.source = source
        self.durationMs = durationMs
    }

    var displayKey: String {
        "\(artist.lowercased())|\(title.lowercased())"
    }

    func isValid() -> Bool {
        !artist.isEmpty &&
            !title.isEmpty &&
            artist.count <= 200 &&
            title.count <= 200
    }
}
