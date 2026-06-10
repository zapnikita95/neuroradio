import Foundation

final class FactHintRateLimiter {
    static let shared = FactHintRateLimiter()

    private let defaults = UserDefaults.standard
    private let maxPerHour = 3
    private let trackCooldownMs: Int64 = 86_400_000

    private init() {}

    func shouldNotify(trackKey: String) -> Bool {
        let now = nowMs()
        let lastTrack = defaults.object(forKey: keyLastTrack(trackKey)) as? Int64 ?? 0
        if now - lastTrack < trackCooldownMs { return false }

        let recent = loadHourlyTimestamps().filter { now - $0 < 3_600_000 }
        return recent.count < maxPerHour
    }

    func record(trackKey: String) {
        let now = nowMs()
        var recent = loadHourlyTimestamps().filter { now - $0 < 3_600_000 }
        recent.append(now)
        defaults.set(recent.map(String.init).joined(separator: ","), forKey: "fact_hint_hourly_ts")
        defaults.set(now, forKey: keyLastTrack(trackKey))
    }

    private func loadHourlyTimestamps() -> [Int64] {
        defaults.string(forKey: "fact_hint_hourly_ts")?
            .split(separator: ",")
            .compactMap { Int64($0) } ?? []
    }

    private func keyLastTrack(_ trackKey: String) -> String {
        "fact_hint_last_\(trackKey)"
    }

    private func nowMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }
}
