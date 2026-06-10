import Foundation
import SwiftData

enum OfflinePackPhase: String, CaseIterable {
    case idle
    case collecting
    case generating
    case ready

    static func from(_ raw: String?) -> OfflinePackPhase {
        guard let raw, let phase = OfflinePackPhase(rawValue: raw) else { return .idle }
        return phase
    }
}

struct OfflinePackUiState {
    var phase: OfflinePackPhase = .idle
    var sessionId: Int64 = 0
    var targetCount: Int = OfflinePackStore.targetCount
    var collectedCount: Int = 0
    var readyCount: Int = 0
    var entries: [OfflinePackEntry] = []
}

@Model
final class OfflinePackEntry {
    var packSessionId: Int64
    var trackKey: String
    var artist: String
    var title: String
    var sortOrder: Int
    var status: String
    var localAudioPath: String?
    var script: String?
    var errorMessage: String?
    var collectedAt: Date
    var readyAt: Date?

    init(
        packSessionId: Int64,
        trackKey: String,
        artist: String,
        title: String,
        sortOrder: Int,
        status: String,
        localAudioPath: String? = nil,
        script: String? = nil,
        errorMessage: String? = nil,
        collectedAt: Date = .now,
        readyAt: Date? = nil
    ) {
        self.packSessionId = packSessionId
        self.trackKey = trackKey
        self.artist = artist
        self.title = title
        self.sortOrder = sortOrder
        self.status = status
        self.localAudioPath = localAudioPath
        self.script = script
        self.errorMessage = errorMessage
        self.collectedAt = collectedAt
        self.readyAt = readyAt
    }
}

@MainActor
final class OfflinePackStore: ObservableObject {
    static let shared = OfflinePackStore()

    static let targetCount = 10
    static let statusCollected = "collected"
    static let statusGenerating = "generating"
    static let statusReady = "ready"
    static let statusFailed = "failed"

    @Published private(set) var uiState = OfflinePackUiState()

    private let settings = SettingsStore.shared
    private let storyRepository = StoryRepository.shared
    private let notifications = NotificationService.shared
    private var generationTask: Task<Void, Never>?

    private var context: ModelContext { StoryHistoryStore.shared.context }

    private init() {}

    func refreshState() {
        let phase = OfflinePackPhase.from(settings.offlinePackPhase)
        let sessionId = settings.offlinePackSessionId
        let entries = sessionId > 0 ? listEntries(sessionId: sessionId) : []
        uiState = OfflinePackUiState(
            phase: phase,
            sessionId: sessionId,
            collectedCount: entries.count,
            readyCount: entries.filter { $0.status == Self.statusReady }.count,
            entries: entries
        )
    }

    func startCollecting() async -> Result<Void, Error> {
        guard TierAccess.canUseOfflineAudioCache(storyRepository.accountTier) else {
            return .failure(NSError(
                domain: "OfflinePack",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: AppStrings.OfflinePack.tierRequiredError]
            ))
        }
        let oldSession = settings.offlinePackSessionId
        if oldSession > 0 {
            deleteSession(oldSession)
        }
        let sessionId = Int64(Date().timeIntervalSince1970 * 1000)
        settings.offlineAudioCacheEnabled = true
        settings.offlinePackSessionId = sessionId
        settings.offlinePackPhase = OfflinePackPhase.collecting.rawValue
        refreshState()
        await notifications.notifyOfflinePackCollecting(collected: 0, target: Self.targetCount)
        return .success(())
    }

    func cancelPack() {
        generationTask?.cancel()
        generationTask = nil
        let sessionId = settings.offlinePackSessionId
        if sessionId > 0 {
            deleteSession(sessionId)
        }
        settings.offlinePackPhase = OfflinePackPhase.idle.rawValue
        settings.offlinePackSessionId = 0
        notifications.cancelOfflinePackNotifications()
        refreshState()
    }

    func onTrackHeard(_ track: TrackInfo) {
        guard track.isValid() else { return }
        guard OfflinePackPhase.from(settings.offlinePackPhase) == .collecting else { return }
        guard TierAccess.canUseOfflineAudioCache(storyRepository.accountTier) else { return }

        let sessionId = settings.offlinePackSessionId
        guard sessionId > 0 else { return }
        if findEntry(sessionId: sessionId, trackKey: track.displayKey) != nil { return }

        let entries = listEntries(sessionId: sessionId)
        guard entries.count < Self.targetCount else { return }

        let entry = OfflinePackEntry(
            packSessionId: sessionId,
            trackKey: track.displayKey,
            artist: track.artist,
            title: track.title,
            sortOrder: entries.count,
            status: Self.statusCollected
        )
        context.insert(entry)
        try? context.save()

        let newCount = entries.count + 1
        refreshState()
        Task {
            await notifications.notifyOfflinePackCollecting(collected: newCount, target: Self.targetCount)
        }

        if newCount >= Self.targetCount {
            onCollectionComplete(sessionId: sessionId)
        }
    }

    private func onCollectionComplete(sessionId: Int64) {
        settings.offlinePackPhase = OfflinePackPhase.generating.rawValue
        refreshState()
        Task {
            await notifications.notifyOfflinePackTracksCollected(count: Self.targetCount)
        }
        generationTask?.cancel()
        generationTask = Task {
            await generatePack(sessionId: sessionId)
        }
    }

    func generatePack(sessionId: Int64) async {
        guard TierAccess.canUseOfflineAudioCache(storyRepository.accountTier) else { return }
        settings.offlinePackPhase = OfflinePackPhase.generating.rawValue
        settings.offlinePackSessionId = sessionId

        let pending = listEntries(sessionId: sessionId)
            .filter { $0.status == Self.statusCollected || $0.status == Self.statusFailed }
        var ready = listEntries(sessionId: sessionId).filter { $0.status == Self.statusReady }.count

        for entry in pending {
            if Task.isCancelled { return }
            if entry.status == Self.statusReady { continue }
            if !NetworkMonitor.isConnected {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                if !NetworkMonitor.isConnected { continue }
            }

            entry.status = Self.statusGenerating
            try? context.save()
            refreshState()
            await notifications.notifyOfflinePackGenerating(ready: ready, target: Self.targetCount)

            let track = TrackInfo(artist: entry.artist, title: entry.title, source: .manual)
            let result = await storyRepository.fetchStoryForOfflinePack(track: track)
            switch result {
            case .success(let response):
                let path = await storyRepository.cachedLocalPath(for: track.displayKey)
                entry.status = Self.statusReady
                entry.localAudioPath = path
                entry.script = response.script
                entry.readyAt = .now
                entry.errorMessage = nil
                ready += 1
            case .failure(let error):
                entry.status = Self.statusFailed
                entry.errorMessage = String(error.localizedDescription.prefix(200))
            }
            try? context.save()
            refreshState()
            await notifications.notifyOfflinePackGenerating(ready: ready, target: Self.targetCount)
        }

        let finalReady = listEntries(sessionId: sessionId).filter { $0.status == Self.statusReady }.count
        if finalReady > 0 {
            settings.offlinePackPhase = OfflinePackPhase.ready.rawValue
            refreshState()
            await notifications.notifyOfflinePackReady(count: finalReady)
        } else {
            settings.offlinePackPhase = OfflinePackPhase.idle.rawValue
            refreshState()
            await notifications.notifyOfflinePackFailed()
        }
    }

    func readyEntry(for trackKey: String) -> OfflinePackEntry? {
        guard OfflinePackPhase.from(settings.offlinePackPhase) == .ready else { return nil }
        let sessionId = settings.offlinePackSessionId
        guard sessionId > 0 else { return nil }
        guard let entry = findEntry(sessionId: sessionId, trackKey: trackKey),
              entry.status == Self.statusReady else { return nil }
        return OfflineAudioStore.shared.hasLocalFile(at: entry.localAudioPath) ? entry : nil
    }

    private func listEntries(sessionId: Int64) -> [OfflinePackEntry] {
        var descriptor = FetchDescriptor<OfflinePackEntry>(
            predicate: #Predicate { $0.packSessionId == sessionId },
            sortBy: [SortDescriptor(\.sortOrder)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    private func findEntry(sessionId: Int64, trackKey: String) -> OfflinePackEntry? {
        var descriptor = FetchDescriptor<OfflinePackEntry>(
            predicate: #Predicate { $0.packSessionId == sessionId && $0.trackKey == trackKey }
        )
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    private func deleteSession(_ sessionId: Int64) {
        for entry in listEntries(sessionId: sessionId) {
            context.delete(entry)
        }
        try? context.save()
    }
}
