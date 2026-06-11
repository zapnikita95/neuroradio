import Foundation

/// When to run the next auto-Shazam attempt: pause for full track length, stop when media stops.
struct ShazamAutoPolicy {
    private(set) var wasOtherAudioPlaying = false
    private(set) var cooldownUntil = Date.distantPast
    private(set) var backoffUntil = Date.distantPast
    private(set) var lastTrackKey: String?
    private(set) var consecutiveNoMatch = 0

    static let minCooldown: TimeInterval = 90
    static let maxCooldown: TimeInterval = 600
    static let defaultCooldown: TimeInterval = 180
    static let failureBackoff: TimeInterval = 120
    static let maxFailuresBeforeBackoff = 2

    mutating func mediaDidStop() {
        wasOtherAudioPlaying = false
        cooldownUntil = .distantPast
        backoffUntil = .distantPast
        lastTrackKey = nil
        consecutiveNoMatch = 0
    }

    mutating func shouldAttempt(otherAudioPlaying: Bool, integratedPlayerActive: Bool) -> Bool {
        if !otherAudioPlaying {
            mediaDidStop()
            return false
        }

        if integratedPlayerActive {
            wasOtherAudioPlaying = otherAudioPlaying
            return false
        }

        let risingEdge = otherAudioPlaying && !wasOtherAudioPlaying
        wasOtherAudioPlaying = otherAudioPlaying

        let now = Date()
        if now < backoffUntil { return false }
        if now < cooldownUntil { return false }
        if consecutiveNoMatch >= Self.maxFailuresBeforeBackoff, !risingEdge { return false }

        return risingEdge || now >= cooldownUntil
    }

    mutating func recordSuccess(_ track: TrackInfo) {
        consecutiveNoMatch = 0
        backoffUntil = .distantPast
        lastTrackKey = track.displayKey
        cooldownUntil = Date().addingTimeInterval(Self.cooldownSeconds(for: track))
    }

    mutating func recordFailure() {
        consecutiveNoMatch += 1
        if consecutiveNoMatch >= Self.maxFailuresBeforeBackoff {
            backoffUntil = Date().addingTimeInterval(Self.failureBackoff)
        }
    }

    static func cooldownSeconds(for track: TrackInfo) -> TimeInterval {
        let raw: TimeInterval
        if track.durationMs > 0 {
            raw = TimeInterval(track.durationMs) / 1000
        } else {
            raw = defaultCooldown
        }
        return min(max(raw, minCooldown), maxCooldown)
    }
}
