import Foundation

@MainActor
enum AccountCloudSync {
    private static let backgroundSyncTimeoutNs: UInt64 = 25_000_000_000

    static func mergeCloudPayload(_ login: AccountLoginResult) {
        applyCloudPayload(login)
    }

    static func finishAccountLogin(_ login: AccountLoginResult) {
        guard login.profile?.isLoggedIn == true else { return }
        Task { @MainActor in
            applyCloudPayload(login)
            await scheduleBackgroundSync()
        }
    }

    static func prefetchAccountHistoryIfLoggedIn() async {
        try? await Task.sleep(nanoseconds: 4_000_000_000)
        guard SettingsStore.shared.accountProfile?.isLoggedIn == true else { return }
        let result = await AccountAuthManager.shared.fetchProfile()
        guard result.profile?.isLoggedIn == true else { return }
        applyCloudPayload(result)
        await scheduleBackgroundSync()
    }

    static func syncAccountDataWithServer() async {
        guard SettingsStore.shared.accountProfile?.isLoggedIn == true else { return }
        let base = SettingsStore.shared.backendURL
        await AccountSyncManager.shared.mergeHistoryFromServer(baseUrl: base)
        await AccountSyncManager.shared.mergeScrobblesFromServer(baseUrl: base)
        await AccountSyncManager.shared.pushAllLocalHistory(baseUrl: base)
        await AccountSyncManager.shared.pushAllLocalScrobbles(baseUrl: base)
        StoryHistoryStore.shared.dedupeStoryHistory()
        StoryHistoryStore.shared.dedupeListeningHistory()
    }

    static func pushHistoryInBackground(_ entry: StoryHistoryEntry) {
        guard SettingsStore.shared.accountProfile?.isLoggedIn == true else { return }
        Task {
            await AccountSyncManager.shared.pushHistoryEntry(
                entry,
                baseUrl: SettingsStore.shared.backendURL
            )
        }
    }

    static func pushScrobbleInBackground(_ entry: ScrobbleEntry) {
        guard SettingsStore.shared.accountProfile?.isLoggedIn == true else { return }
        Task {
            await AccountSyncManager.shared.pushScrobbleEntry(
                entry,
                baseUrl: SettingsStore.shared.backendURL
            )
        }
    }

    private static func applyCloudPayload(_ login: AccountLoginResult) {
        if !login.history.isEmpty {
            StoryHistoryStore.shared.mergeHistoryEntries(login.history)
        }
        if !login.scrobbles.isEmpty {
            StoryHistoryStore.shared.mergeScrobbleEntries(login.scrobbles)
        }
        StoryHistoryStore.shared.dedupeStoryHistory()
        StoryHistoryStore.shared.dedupeListeningHistory()
    }

    private static func scheduleBackgroundSync() async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask {
                await withTimeout(seconds: 25) {
                    await syncAccountDataWithServer()
                }
            }
        }
    }

    private static func withTimeout(seconds: UInt64, operation: @escaping () async -> Void) async {
        await withTaskGroup(of: Bool.self) { group in
            group.addTask {
                await operation()
                return true
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
                return false
            }
            _ = await group.next()
            group.cancelAll()
        }
    }
}
