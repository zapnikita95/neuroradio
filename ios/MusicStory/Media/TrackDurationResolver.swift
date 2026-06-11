import Foundation

/// Best-effort song length for Shazam cooldown (iTunes Search, no API key).
enum TrackDurationResolver {
    private static let defaultDurationMs: Int64 = 180_000
    private static var cache: [String: Int64] = [:]

    static func resolveDurationMs(artist: String, title: String) async -> Int64 {
        let key = "\(artist.lowercased())|\(title.lowercased())"
        if let cached = cache[key], cached > 0 {
            return cached
        }

        guard let url = searchURL(artist: artist, title: title) else {
            return defaultDurationMs
        }

        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 4
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
                return defaultDurationMs
            }
            let decoded = try JSONDecoder().decode(ITunesSearchResponse.self, from: data)
            if let ms = decoded.results.first?.trackTimeMillis, ms > 0 {
                cache[key] = ms
                return ms
            }
        } catch {
            // Fallback below.
        }
        return defaultDurationMs
    }

    private static func searchURL(artist: String, title: String) -> URL? {
        let term = "\(title) \(artist)"
        var components = URLComponents(string: "https://itunes.apple.com/search")
        components?.queryItems = [
            URLQueryItem(name: "term", value: term),
            URLQueryItem(name: "entity", value: "song"),
            URLQueryItem(name: "limit", value: "1"),
        ]
        return components?.url
    }
}

private struct ITunesSearchResponse: Decodable {
    struct Item: Decodable {
        let trackTimeMillis: Int64?
    }

    let results: [Item]
}
