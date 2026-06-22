import Foundation
import Network

enum TierAccess {
    static func isPremiumLike(_ tier: String?) -> Bool {
        if IosAppStorePolicy.suppressPaidFeatures { return false }
        guard let tier else { return false }
        return ["premium", "trial", "unlimited"].contains(tier.lowercased())
    }

    static func canUseOfflineAudioCache(_ tier: String?) -> Bool {
        isPremiumLike(tier)
    }
}

enum NetworkMonitor {
    static var isConnected: Bool {
        let monitor = NWPathMonitor()
        let semaphore = DispatchSemaphore(value: 0)
        var connected = false
        monitor.pathUpdateHandler = { path in
            connected = path.status == .satisfied
            semaphore.signal()
        }
        let queue = DispatchQueue(label: "NetworkMonitor")
        monitor.start(queue: queue)
        _ = semaphore.wait(timeout: .now() + 0.5)
        monitor.cancel()
        return connected
    }

    static var isWifi: Bool {
        let monitor = NWPathMonitor()
        let semaphore = DispatchSemaphore(value: 0)
        var wifi = false
        monitor.pathUpdateHandler = { path in
            wifi = path.status == .satisfied && path.usesInterfaceType(.wifi)
            semaphore.signal()
        }
        let queue = DispatchQueue(label: "NetworkMonitorWifi")
        monitor.start(queue: queue)
        _ = semaphore.wait(timeout: .now() + 0.5)
        monitor.cancel()
        return wifi
    }
}
