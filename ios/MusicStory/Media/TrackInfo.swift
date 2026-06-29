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

    func isPlaceholder() -> Bool {
        let a = artist.lowercased()
        let t = title.lowercased()
        if a.contains("вспоминаем трек") || a.contains("remember") { return true }
        if t.contains("скоро начн") || t.contains("остановились") || t.contains("will begin") { return true }
        if t.contains("музыка скоро") || t == "paused" { return true }
        if MediaJunkFilter.isNonMusicPlaybackMetadata(artist: artist, title: title) { return true }
        return false
    }

    func isValid() -> Bool {
        !artist.isEmpty &&
            !title.isEmpty &&
            !isPlaceholder() &&
            artist.count <= 200 &&
            title.count <= 200
    }
}
