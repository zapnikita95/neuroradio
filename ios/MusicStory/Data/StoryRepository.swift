import Foundation
import Combine

@MainActor
final class StoryRepository: ObservableObject {
    static let shared = StoryRepository()

    private let backend = BackendClient.shared
    private let history = StoryHistoryStore.shared
    private let settings = SettingsStore.shared
    private let offlineStore = OfflineAudioStore.shared

    @Published private(set) var dailyQuota: StoryQuotaInfo?
    @Published private(set) var accountTier: String?

    static let offlineNoCacheMessage =
        "Нет интернета. Эта история ещё не сохранена на телефоне — один раз послушайте онлайн с расширенным тарифом."

    func hasHotFactForTrack(artist: String, title: String) async -> Bool {
        do {
            let hint = try await backend.fetchFactHint(artist: artist, title: title)
            return hint.hasHotFact
        } catch {
            return false
        }
    }

    func refreshQuota() async {
        do {
            let response = try await backend.fetchQuota()
            dailyQuota = response.quota
            accountTier = response.tier
        } catch {
            // quota is optional UI hint
        }
    }

    func fetchStory(track: TrackInfo, forceRefresh: Bool = true) async -> Result<StoryResponse, Error> {
        guard track.isValid() else {
            return .failure(BackendError.serverError(400, "Некорректные метаданные трека"))
        }

        if !NetworkMonitor.isConnected {
            if let replay = offlinePackResponse(for: track.displayKey) ?? offlineReplayResponse(for: track.displayKey) {
                return .success(replay)
            }
            return .failure(BackendError.serverError(0, Self.offlineNoCacheMessage))
        }

        let previousScripts = history.recentScripts(for: track.displayKey)
        let request = StoryRequest(
            artist: track.artist,
            title: track.title,
            previousScripts: previousScripts,
            storyLength: settings.storyLength.rawValue,
            storyNarrator: settings.storyNarrator.rawValue,
            ttsVoice: settings.ttsVoice.rawValue,
            ttsSpeed: settings.ttsSpeedPreset.yandexSpeed,
            ttsEmotion: settings.ttsEmotion.rawValue,
            clientPlatform: "ios",
            ttsProvider: settings.effectiveServerTtsProvider.rawValue,
            edgeVoicePreset: settings.edgeVoicePreset.rawValue
        )

        do {
            let response = try await backend.fetchFullStory(request: request)
            history.saveStory(response, track: track)
            dailyQuota = response.quota
            let localPath = await maybeDownloadOfflineAudio(trackKey: track.displayKey, audioUrl: response.audioUrl)
            history.upsertCachedStory(
                trackKey: track.displayKey,
                response: response,
                localAudioPath: localPath
            )
            return .success(response)
        } catch {
            return .failure(error)
        }
    }

    func fetchStoryForOfflinePack(track: TrackInfo) async -> Result<StoryResponse, Error> {
        await fetchStory(track: track, forceRefresh: true)
    }

    func cachedLocalPath(for trackKey: String) -> String? {
        guard let cached = history.cachedStory(for: trackKey),
              offlineStore.hasLocalFile(at: cached.localAudioPath) else { return nil }
        return cached.localAudioPath
    }

    func resolveAudioURL(_ audioURL: String?) -> URL? {
        backend.resolveAudioURL(audioURL)
    }

    func resolvePlaybackURL(trackKey: String, audioURL: String?, preferLocal: Bool = false) -> URL? {
        if preferLocal, canUseOfflineReplay() {
            if let pack = OfflinePackStore.shared.readyEntry(for: trackKey),
               let path = pack.localAudioPath,
               offlineStore.hasLocalFile(at: path) {
                return offlineStore.localFileURL(path: path)
            }
            if let cached = history.cachedStory(for: trackKey),
               offlineStore.hasLocalFile(at: cached.localAudioPath) {
                return offlineStore.localFileURL(path: cached.localAudioPath!)
            }
        }
        return resolveAudioURL(audioURL)
    }

    func recordStoryPlaybackComplete(_ response: StoryResponse) async {
        guard let seedFact = response.seedFact?.trimmingCharacters(in: .whitespacesAndNewlines),
              !seedFact.isEmpty else { return }
        await backend.submitStoryPlaybackComplete(
            artist: response.artist,
            title: response.title,
            script: response.script,
            seedFact: seedFact,
            seedScope: response.seedScope,
            seedInterestScore: response.seedInterestScore,
            seedInterestRating: response.seedInterestRating,
            storyNarrator: settings.storyNarrator.rawValue
        )
    }

    func canReplayOffline(trackKey: String) -> Bool {
        guard canUseOfflineReplay(),
              let cached = history.cachedStory(for: trackKey) else { return false }
        return offlineStore.hasLocalFile(at: cached.localAudioPath)
    }

    func offlineReplayResponse(for trackKey: String) -> StoryResponse? {
        guard canUseOfflineReplay(),
              let cached = history.cachedStory(for: trackKey),
              offlineStore.hasLocalFile(at: cached.localAudioPath),
              !cached.demo else { return nil }
        return storyResponse(from: cached.artist, title: cached.title, script: cached.script, demo: cached.demo, audioUrl: cached.audioUrl)
    }

    func offlinePackResponse(for trackKey: String) -> StoryResponse? {
        guard canUseOfflineReplay(),
              let entry = OfflinePackStore.shared.readyEntry(for: trackKey),
              let script = entry.script else { return nil }
        return storyResponse(from: entry.artist, title: entry.title, script: script, demo: false, audioUrl: nil)
    }

    private func storyResponse(
        from artist: String,
        title: String,
        script: String,
        demo: Bool,
        audioUrl: String?
    ) -> StoryResponse {
        StoryResponse(
            artist: artist,
            title: title,
            year: nil,
            genre: nil,
            mbid: nil,
            script: script,
            wordCount: script.split(separator: " ").count,
            voiceId: nil,
            demo: demo,
            audioUrl: audioUrl,
            audioFile: nil,
            ttsHint: nil,
            quota: dailyQuota
        )
    }

    func prefetchMissingOfflineAudio() async {
        guard canUseOfflineReplay(), NetworkMonitor.isWifi else { return }
        for cached in history.cachedStoriesMissingLocalAudio() {
            guard canUseOfflineReplay(),
                  let remote = resolveAudioURL(cached.audioUrl) else { continue }
            if let path = await offlineStore.download(from: remote, trackKey: cached.trackKey) {
                history.updateLocalAudioPath(trackKey: cached.trackKey, path: path)
            }
        }
        offlineStore.enforceStorageLimit()
    }

    private func canUseOfflineReplay() -> Bool {
        settings.offlineAudioCacheEnabled && TierAccess.canUseOfflineAudioCache(accountTier)
    }

    private func maybeDownloadOfflineAudio(trackKey: String, audioUrl: String?) async -> String? {
        guard canUseOfflineReplay(),
              let remote = resolveAudioURL(audioUrl) else { return nil }
        let path = await offlineStore.download(from: remote, trackKey: trackKey)
        if path != nil {
            offlineStore.enforceStorageLimit()
        }
        return path
    }

    func submitPendingStoryFeedback(
        feedback: PendingStoryFeedback,
        vote: String,
        reasons: [String]
    ) async -> Bool {
        guard !reasons.isEmpty else { return false }
        let settings = SettingsStore.shared
        let langCode = Locale.preferredLanguages.first?.lowercased().hasPrefix("en") == true ? "en" : "ru"
        let request = StoryFeedbackRequest(
            artist: feedback.artist,
            title: feedback.title,
            vote: vote,
            reason: reasons[0],
            reasons: reasons,
            script: feedback.script,
            historyId: nil,
            story_narrator: settings.storyNarrator.rawValue,
            lang: langCode
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
