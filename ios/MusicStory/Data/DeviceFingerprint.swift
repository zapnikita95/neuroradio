import CryptoKit
import Foundation
import UIKit

enum DeviceFingerprint {
    static func current() -> String {
        let vendor = UIDevice.current.identifierForVendor?.uuidString ?? "unknown-ios"
        let bundle = Bundle.main.bundleIdentifier ?? "com.musicstory.app"
        let raw = "\(vendor)|\(bundle)"
        let digest = SHA256.hash(data: Data(raw.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
