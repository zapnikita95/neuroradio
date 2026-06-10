import CryptoKit
import Foundation

final class OfflineAudioStore {
    static let shared = OfflineAudioStore()

    private let directory: URL
    private let session: URLSession

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        directory = base.appendingPathComponent("offline_stories", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        session = URLSession(configuration: config)
    }

    func localFile(for trackKey: String) -> URL {
        directory.appendingPathComponent("\(hashTrackKey(trackKey)).ogg")
    }

    func hasLocalFile(at path: String?) -> Bool {
        guard let path, !path.isEmpty else { return false }
        let url = URL(fileURLWithPath: path)
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attrs[.size] as? NSNumber else { return false }
        return size.int64Value > 512
    }

    func localFileURL(path: String) -> URL {
        URL(fileURLWithPath: path)
    }

    func download(from url: URL, trackKey: String) async -> String? {
        let target = localFile(for: trackKey)
        let temp = target.deletingLastPathComponent().appendingPathComponent("\(target.lastPathComponent).part")
        for attempt in 0..<3 {
            if attempt > 0 {
                try? await Task.sleep(nanoseconds: UInt64(400_000_000 * UInt64(attempt)))
            }
            do {
                let (data, response) = try await session.data(from: url)
                guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                    continue
                }
                guard data.count > 512 else { continue }
                try data.write(to: temp, options: .atomic)
                if FileManager.default.fileExists(atPath: target.path) {
                    try? FileManager.default.removeItem(at: target)
                }
                try FileManager.default.moveItem(at: temp, to: target)
                return target.path
            } catch {
                try? FileManager.default.removeItem(at: temp)
            }
        }
        return nil
    }

    func enforceStorageLimit(maxBytes: Int64 = 500 * 1024 * 1024) {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey]
        ) else { return }
        var entries: [(url: URL, size: Int64, date: Date)] = []
        var total: Int64 = 0
        for url in files where url.pathExtension == "ogg" {
            let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
            let size = Int64(values?.fileSize ?? 0)
            let date = values?.contentModificationDate ?? .distantPast
            entries.append((url, size, date))
            total += size
        }
        guard total > maxBytes else { return }
        for entry in entries.sorted(by: { $0.date < $1.date }) {
            if total <= maxBytes { break }
            try? FileManager.default.removeItem(at: entry.url)
            total -= entry.size
        }
    }

    private func hashTrackKey(_ trackKey: String) -> String {
        let digest = SHA256.hash(data: Data(trackKey.utf8))
        return digest.map { String(format: "%02x", $0) }.joined().prefix(32).lowercased()
    }
}
