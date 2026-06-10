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
            if let tier = response.tier, !tier.isEmpty {
                settings.serverTier = tier
            }
        } catch {
            // quota is optional UI hint
        }
    }

    func fetchStory(track: TrackInfo, forceRefresh: Bool = true) async -> Result<StoryResponse, Error> {
        guard track.isValid() else {
            return .failure(BackendError.serverError(400, "Некорректные метаданные трека"))
        }

        let previousScripts = history.recentScripts(for: track.displayKey)
        let paidTier = settings.hasPremiumTtsAccess
        let ttsProvider = settings.effectiveServerTtsProvider
        let request = StoryRequest(
            artist: track.artist,
            title: track.title,
            previousScripts: previousScripts,
            storyLength: settings.storyLength.rawValue,
            ttsSpeed: settings.ttsSpeedPreset.yandexSpeed,
            ttsEmotion: settings.ttsEmotion.rawValue,
            storyNarrator: settings.storyNarrator.rawValue,
            ttsVoice: settings.ttsVoice.rawValue,
            edgeVoicePreset: ttsProvider == .edge ? settings.edgeVoicePreset.rawValue : nil,
            ttsProvider: ttsProvider == .yandex ? "yandex" : "edge",
            voiceTier: paidTier ? "premium" : "default",
            speakTrackNamesInVoiceover: settings.speakTrackNamesInVoiceover
        )

        do {
            let response = try await backend.fetchFullStory(request: request)
            history.saveStory(response, track: track)
            dailyQuota = response.quota
            if let tier = response.tier, !tier.isEmpty {
                settings.serverTier = tier
            }
            return .success(response)
        } catch {
            return .failure(error)
        }
    }

    func resolveAudioURL(_ audioURL: String?) -> URL? {
        backend.resolveAudioURL(audioURL)
    }

    func submitPendingStoryFeedback(
        feedback: PendingStoryFeedback,
        vote: String,
        reasons: [String]
    ) async -> Bool {
        guard !reasons.isEmpty else { return false }
        let request = StoryFeedbackRequest(
            artist: feedback.artist,
            title: feedback.title,
            vote: vote,
            reason: reasons[0],
            reasons: reasons,
            script: feedback.script,
            historyId: nil
        )
        do {
            try await backend.submitStoryFeedback(request)
            history.updateVote(trackKey: feedback.trackKey, script: feedback.script, vote: vote)
            return true
        } catch {
            return false
        }
    }
}