import Foundation
import Combine

@MainActor
final class StoryRepository: ObservableObject {
    static let shared = StoryRepository()

    private let backend = BackendClient.shared
    private let history = StoryHistoryStore.shared
    private let settings = SettingsStore.shared

    @Published private(set) var dailyQuota: StoryQuotaInfo?

    func refreshQuota() async {
        do {
            let response = try await backend.fetchQuota()
            dailyQuota = response.quota
        } catch {
            // quota is optional UI hint
        }
    }

    func fetchStory(track: TrackInfo, forceRefresh: Bool = true) async -> Result<StoryResponse, Error> {
        guard track.isValid() else {
            return .failure(BackendError.serverError(400, "Некорректные метаданные трека"))
        }

        let previousScripts = history.recentScripts(for: track.displayKey)
        let request = StoryRequest(
            artist: track.artist,
            title: track.title,
            previousScripts: previousScripts,
            storyLength: "30s",
            ttsSpeed: settings.ttsSpeed,
            ttsEmotion: "lively"
        )

        do {
            let response = try await backend.fetchFullStory(request: request)
            history.saveStory(response, track: track)
            dailyQuota = response.quota
            return .success(response)
        } catch {
            return .failure(error)
        }
    }

    func resolveAudioURL(_ audioURL: String?) -> URL? {
        backend.resolveAudioURL(audioURL)
    }
}