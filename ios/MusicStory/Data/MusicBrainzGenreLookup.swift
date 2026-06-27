import Foundation

enum MusicBrainzGenreLookup {
    private static var cache: [String: String] = [:]
    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 6
        config.timeoutIntervalForResource = 8
        return URLSession(configuration: config)
    }()

    static func fetchGenre(artist: String, title: String) async -> String? {
        let key = "\(artist.lowercased())|\(title.lowercased())"
        if let cached = cache[key] { return cached }

        guard let encoded = ("artist:\"\(artist)\" AND recording:\"\(title)\"")
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return nil }

        let urlString = "https://musicbrainz.org/ws/2/recording?query=\(encoded)&fmt=json&limit=1&inc=tags"
        guard let url = URL(string: urlString) else { return nil }

        var request = URLRequest(url: url)
        request.setValue("MusicStoryApp/1.0 (iOS)", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
            guard
                let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                let recordings = json["recordings"] as? [[String: Any]],
                let first = recordings.first,
                let tags = first["tags"] as? [[String: Any]]
            else { return nil }

            let best = tags.max { ($0["count"] as? Int ?? 0) < ($1["count"] as? Int ?? 0) }
            guard let name = best?["name"] as? String, !name.isEmpty else { return nil }
            cache[key] = name
            return name
        } catch {
            return nil
        }
    }
}
