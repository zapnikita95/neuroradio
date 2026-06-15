import Foundation

@MainActor
final class AccountSyncManager {
    static let shared = AccountSyncManager()

    private let backend = BackendClient.shared
    private let settings = SettingsStore.shared

    private init() {}

    func ensureSyncRegistered(baseUrl: String) async -> Bool {
        if let status = await refreshStatus(baseUrl: baseUrl), status.linked {
            return true
        }
        let localCode = settings.syncCode.trimmingCharacters(in: .whitespacesAndNewlines)
        if !localCode.isEmpty, await linkAccount(baseUrl: baseUrl, syncCode: localCode) {
            return true
        }
        guard let newCode = await createAccount(baseUrl: baseUrl) else { return false }
        settings.setSyncCode(newCode)
        return await refreshStatus(baseUrl: baseUrl)?.linked == true
    }

    func mergeHistoryFromServer(baseUrl: String) async {
        guard let remote = await pullHistory(baseUrl: baseUrl) else { return }
        StoryHistoryStore.shared.mergeHistoryEntries(remote)
    }

    func mergeScrobblesFromServer(baseUrl: String) async {
        guard let remote = await pullScrobbles(baseUrl: baseUrl) else { return }
        StoryHistoryStore.shared.mergeScrobbleEntries(remote)
    }

    func pushAllLocalHistory(baseUrl: String) async {
        guard await ensureSyncRegistered(baseUrl: baseUrl) else { return }
        for entry in StoryHistoryStore.shared.allRecentHistory() {
            await pushHistoryEntry(entry, baseUrl: baseUrl)
        }
    }

    func pushAllLocalScrobbles(baseUrl: String) async {
        guard await ensureSyncRegistered(baseUrl: baseUrl) else { return }
        for entry in StoryHistoryStore.shared.allRecentScrobbles() {
            await pushScrobbleEntry(entry, baseUrl: baseUrl)
        }
    }

    func pushHistoryEntry(_ entry: StoryHistoryEntry, baseUrl: String) async {
        guard settings.accountProfile?.isLoggedIn == true else { return }
        if entry.serverId?.isEmpty != false {
            entry.serverId = UUID().uuidString.lowercased()
            try? StoryHistoryStore.shared.context.save()
        }
        guard await ensureSyncRegistered(baseUrl: baseUrl) else { return }
        let body = try? JSONSerialization.data(withJSONObject: entry.syncPayload())
        _ = try? await postSync(path: "v1/sync/history", baseUrl: baseUrl, body: body)
    }

    func pushScrobbleEntry(_ entry: ScrobbleEntry, baseUrl: String) async {
        guard settings.accountProfile?.isLoggedIn == true else { return }
        if entry.serverId?.isEmpty != false {
            entry.serverId = UUID().uuidString.lowercased()
            try? StoryHistoryStore.shared.context.save()
        }
        guard await ensureSyncRegistered(baseUrl: baseUrl) else { return }
        let body = try? JSONSerialization.data(withJSONObject: entry.syncPayload())
        _ = try? await postSync(path: "v1/sync/scrobbles", baseUrl: baseUrl, body: body)
    }

    private struct SyncStatus {
        let linked: Bool
    }

    private func refreshStatus(baseUrl: String) async -> SyncStatus? {
        guard let json = try? await authorizedGET(path: "v1/sync/status", baseUrl: baseUrl) else { return nil }
        return SyncStatus(linked: json["linked"] as? Bool ?? false)
    }

    private func createAccount(baseUrl: String) async -> String? {
        guard let json = try? await authorizedPOST(path: "v1/sync/create", baseUrl: baseUrl, body: "{}".data(using: .utf8)) else {
            return nil
        }
        return (json["syncCode"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
    }

    private func linkAccount(baseUrl: String, syncCode: String) async -> Bool {
        let payload = try? JSONSerialization.data(withJSONObject: ["sync_code": syncCode.uppercased()])
        guard let json = try? await authorizedPOST(path: "v1/sync/link", baseUrl: baseUrl, body: payload) else {
            return false
        }
        return (json["ok"] as? Bool) ?? (json["linked"] as? Bool) ?? true
    }

    private func pullHistory(baseUrl: String, since: Int64 = 0) async -> [CloudStoryHistoryEntry]? {
        guard let json = try? await authorizedGET(path: "v1/sync/history?since=\(since)", baseUrl: baseUrl) else {
            return nil
        }
        return CloudHistoryMapper.parseStoryHistory(json)
    }

    private func pullScrobbles(baseUrl: String, since: Int64 = 0) async -> [CloudScrobbleEntry]? {
        guard let json = try? await authorizedGET(path: "v1/sync/scrobbles?since=\(since)", baseUrl: baseUrl) else {
            return nil
        }
        return CloudHistoryMapper.parseScrobbles(json)
    }

    private func authorizedGET(path: String, baseUrl: String) async throws -> [String: Any] {
        _ = baseUrl
        return try await backend.authorizedJSON(path: path, method: "GET", body: nil)
    }

    private func authorizedPOST(path: String, baseUrl: String, body: Data?) async throws -> [String: Any] {
        _ = baseUrl
        return try await backend.authorizedJSON(path: path, method: "POST", body: body)
    }

    private func postSync(path: String, baseUrl: String, body: Data?) async throws -> Int {
        _ = baseUrl
        let data = try await backend.authorizedJSON(path: path, method: "POST", body: body)
        _ = data
        return 200
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
