import Foundation

enum TriggerMode: String, CaseIterable, Identifiable {
    case everyNTracks = "EVERY_N_TRACKS"
    case specificArtists = "SPECIFIC_ARTISTS"
    case specificGenres = "SPECIFIC_GENRES"
    case always = "ALWAYS"
    case never = "NEVER"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .everyNTracks: return "Каждые N треков"
        case .specificArtists: return "Выбранные артисты"
        case .specificGenres: return "Выбранные жанры"
        case .always: return "Всегда"
        case .never: return "Никогда"
        }
    }
}

struct TriggerSettings: Sendable {
    var mode: TriggerMode = .everyNTracks
    var everyNTracks: Int = SettingsDefaults.everyNTracks
    var sameTrackStoryEveryN: Int = SettingsDefaults.sameTrackStoryEveryN
    var specificArtists: Set<String> = []
    var specificGenres: Set<String> = []
    var autoIntercept: Bool = true
}

final class TriggerEngine {
    private var tracksSinceLastStory = 0
    private var sameTrackPlayCounts: [String: Int] = [:]

    func resetCounter() {
        tracksSinceLastStory = 0
        sameTrackPlayCounts.removeAll()
    }

    func onTrackPlayed(
        settings: TriggerSettings,
        trackKey: String,
        trackArtist: String,
        trackGenre: String?
    ) -> Bool {
        registerSameTrackPlay(trackKey)

        guard settings.autoIntercept, settings.mode != .never else {
            return false
        }

        let globalOk: Bool = switch settings.mode {
        case .always:
            true
        case .never:
            false
        case .everyNTracks:
            tracksSinceLastStory += 1
            if tracksSinceLastStory >= settings.everyNTracks {
                tracksSinceLastStory = 0
                true
            } else {
                false
            }
        case .specificArtists:
            settings.specificArtists.contains { selected in
                trackArtist.caseInsensitiveCompare(selected) == .orderedSame ||
                    trackArtist.localizedCaseInsensitiveContains(selected)
            }
        case .specificGenres:
            guard let genre = trackGenre else { return false }
            return settings.specificGenres.contains { selected in
                genre.caseInsensitiveCompare(selected) == .orderedSame ||
                    genre.localizedCaseInsensitiveContains(selected)
            }
        }

        guard globalOk else { return false }
        return sameTrackStoryAllowed(trackKey: trackKey, interval: settings.sameTrackStoryEveryN)
    }

    func sameTrackStoryAllowed(trackKey: String, interval: Int) -> Bool {
        let count = sameTrackPlayCounts[trackKey] ?? 1
        if interval <= 1 { return true }
        return count == 1 || count % interval == 0
    }

    func tracksUntilNext(settings: TriggerSettings) -> Int? {
        guard settings.mode == .everyNTracks else { return nil }
        return max(settings.everyNTracks - tracksSinceLastStory, 0)
    }

    private func registerSameTrackPlay(trackKey: String) {
        sameTrackPlayCounts[trackKey, default: 0] += 1
    }
}
