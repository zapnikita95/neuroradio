import Foundation
import UserNotifications

@MainActor
final class NotificationService: NSObject, ObservableObject {
    static let shared = NotificationService()

    static let categoryTrackChanged = "TRACK_CHANGED"
    static let categoryFactHint = "FACT_HINT"
    static let actionTellStory = "TELL_STORY"

    var onTellStoryAction: ((String, String) -> Void)?

    private override init() {
        super.init()
    }

    func configure() {
        UNUserNotificationCenter.current().delegate = self

        let tellStory = UNNotificationAction(
            identifier: Self.actionTellStory,
            title: "Рассказать историю",
            options: [.foreground]
        )
        let factHint = UNNotificationCategory(
            identifier: Self.categoryFactHint,
            actions: [tellStory],
            intentIdentifiers: [],
            options: []
        )
        let trackChanged = UNNotificationCategory(
            identifier: Self.categoryTrackChanged,
            actions: [tellStory],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([factHint, trackChanged])
    }

    func requestAuthorization() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    func notifyFactHint(track: TrackInfo) async {
        guard await authorizationGranted() else { return }
        guard FactHintRateLimiter.shared.shouldNotify(trackKey: track.displayKey) else { return }

        let content = UNMutableNotificationContent()
        content.title = track.title
        content.subtitle = track.artist
        content.body = "По этому треку есть интересный факт. Хотите послушать?"
        content.sound = .default
        content.categoryIdentifier = Self.categoryFactHint
        content.userInfo = [
            "artist": track.artist,
            "title": track.title,
        ]

        let request = UNNotificationRequest(
            identifier: "fact-hint-\(track.displayKey)-\(Int(Date().timeIntervalSince1970))",
            content: content,
            trigger: nil
        )

        try? await UNUserNotificationCenter.current().add(request)
        FactHintRateLimiter.shared.record(trackKey: track.displayKey)
    }

    func notifyTrackChanged(track: TrackInfo, autoMode: Bool) async {
        guard await authorizationGranted() else { return }

        let content = UNMutableNotificationContent()
        content.title = track.title
        content.subtitle = track.artist
        content.body = autoMode
            ? "Новый трек — можно запросить историю"
            : "Нажми «Рассказать историю»"
        content.sound = .default
        content.categoryIdentifier = Self.categoryTrackChanged
        content.userInfo = [
            "artist": track.artist,
            "title": track.title,
        ]

        let request = UNNotificationRequest(
            identifier: "track-\(track.displayKey)-\(Int(Date().timeIntervalSince1970))",
            content: content,
            trigger: nil
        )

        try? await UNUserNotificationCenter.current().add(request)
    }

    func notifyOfflinePackCollecting(collected: Int, target: Int) async {
        guard await authorizationGranted() else { return }
        let content = UNMutableNotificationContent()
        content.title = AppStrings.OfflinePack.notifCollectingTitle
        content.body = AppStrings.OfflinePack.notifCollectingBody(collected: collected, target: target)
        content.threadIdentifier = "offline-pack"
        let request = UNNotificationRequest(
            identifier: "offline-pack-collecting",
            content: content,
            trigger: nil
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    func notifyOfflinePackTracksCollected(count: Int) async {
        guard await authorizationGranted() else { return }
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["offline-pack-collecting"])
        let content = UNMutableNotificationContent()
        content.title = AppStrings.OfflinePack.notifTracksReadyTitle
        content.body = AppStrings.OfflinePack.notifTracksReadyBody(count: count)
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: "offline-pack-tracks-ready",
            content: content,
            trigger: nil
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    func notifyOfflinePackGenerating(ready: Int, target: Int) async {
        guard await authorizationGranted() else { return }
        let content = UNMutableNotificationContent()
        content.title = AppStrings.OfflinePack.notifGeneratingTitle
        content.body = AppStrings.OfflinePack.notifGeneratingBody(ready: ready, target: target)
        content.threadIdentifier = "offline-pack"
        let request = UNNotificationRequest(
            identifier: "offline-pack-generating",
            content: content,
            trigger: nil
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    func notifyOfflinePackReady(count: Int) async {
        guard await authorizationGranted() else { return }
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["offline-pack-generating"])
        let content = UNMutableNotificationContent()
        content.title = AppStrings.OfflinePack.notifDoneTitle
        content.body = AppStrings.OfflinePack.notifDoneBody(count: count)
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: "offline-pack-ready",
            content: content,
            trigger: nil
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    func notifyOfflinePackFailed() async {
        guard await authorizationGranted() else { return }
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["offline-pack-generating"])
        let content = UNMutableNotificationContent()
        content.title = AppStrings.OfflinePack.notifFailedTitle
        content.body = AppStrings.OfflinePack.notifFailedBody
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: "offline-pack-failed",
            content: content,
            trigger: nil
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    func notifyTrialStarted() async {
        guard await authorizationGranted() else { return }
        let content = UNMutableNotificationContent()
        content.title = AppStrings.l10n(.ru).trialStartedNotifTitle
        content.body = AppStrings.l10n(.ru).trialStartedNotifBody
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: "welcome-trial-started",
            content: content,
            trigger: nil
        )
        try? await UNUserNotificationCenter.current().add(request)
    }

    func cancelOfflinePackNotifications() {
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [
            "offline-pack-collecting",
            "offline-pack-generating",
        ])
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [
            "offline-pack-collecting",
            "offline-pack-generating",
        ])
    }

    private func authorizationGranted() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return settings.authorizationStatus == .authorized ||
            settings.authorizationStatus == .provisional
    }
}

extension NotificationService: UNUserNotificationCenterDelegate {
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        guard response.actionIdentifier == Self.actionTellStory ||
                response.actionIdentifier == UNNotificationDefaultActionIdentifier else {
            return
        }

        let artist = userInfo["artist"] as? String ?? ""
        let title = userInfo["title"] as? String ?? ""
        guard !artist.isEmpty, !title.isEmpty else { return }

        await MainActor.run {
            onTellStoryAction?(artist, title)
        }
    }
}
