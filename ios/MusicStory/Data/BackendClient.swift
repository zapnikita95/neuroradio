import Foundation
import CryptoKit

enum BackendError: LocalizedError {
    case invalidURL
    case unauthorized
    case serverError(Int, String?)
    case decodingFailed
    case network(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Некорректный URL бэкенда"
        case .unauthorized:
            return "Не удалось авторизоваться на сервере"
        case .serverError(let code, let message):
            return message ?? "Ошибка сервера (\(code))"
        case .decodingFailed:
            return "Некорректный ответ сервера"
        case .network(let error):
            return error.localizedDescription
        }
    }
}

@MainActor
final class BackendClient {
    static let shared = BackendClient()

    private let session: URLSession
    private let settings = SettingsStore.shared
    private let tokenRefreshSkewMs: Int64 = 7 * 24 * 60 * 60 * 1000

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        session = URLSession(configuration: config)
    }

    func warmUp() async {
        _ = try? await getAccessToken(forceRefresh: false)
    }

    func fetchHealth() async throws -> HealthResponse {
        let url = try healthURL()
        let (data, response) = try await session.data(from: url)
        try validateHTTP(response)
        return try decode(HealthResponse.self, from: data)
    }

    func fetchQuota() async throws -> QuotaResponse {
        let url = try apiURL(path: "v1/story/quota")
        let (data, response) = try await authorizedData(for: url, method: "GET", body: nil)
        try validateHTTP(response)
        return try decode(QuotaResponse.self, from: data)
    }

    func fetchBillingStatus(appLanguage: String = "ru") async throws -> BillingStatusResponse {
        var components = URLComponents(url: try apiURL(path: "v1/billing/status"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "appLanguage", value: appLanguage)]
        guard let url = components?.url else { throw BackendError.invalidURL }
        let (data, response) = try await authorizedData(for: url, method: "GET", body: nil)
        try validateHTTP(response)
        return try decode(BillingStatusResponse.self, from: data)
    }

    func verifyAppStorePurchase(receiptData: String) async throws -> IapVerifyResponse {
        let url = try apiURL(path: "v1/billing/verify/app-store")
        let body = try JSONEncoder().encode(AppStoreVerifyRequest(receiptData: receiptData))
        let (data, response) = try await authorizedData(for: url, method: "POST", body: body)
        try validateHTTP(response)
        return try decode(IapVerifyResponse.self, from: data)
    }

    func fetchFactHint(artist: String, title: String) async throws -> FactHintResponse {
        var components = URLComponents(url: try apiURL(path: "v1/facts/hint"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "artist", value: artist),
            URLQueryItem(name: "title", value: title),
        ]
        guard let url = components?.url else { throw BackendError.invalidURL }
        let (data, response) = try await authorizedData(for: url, method: "GET", body: nil)
        try validateHTTP(response)
        return try decode(FactHintResponse.self, from: data)
    }

    func fetchFullStory(request: StoryRequest) async throws -> StoryResponse {
        let url = try apiURL(path: "v1/story/full")
        let body = try JSONEncoder().encode(request)
        let (data, response) = try await authorizedData(for: url, method: "POST", body: body)
        try validateHTTP(response)
        return try decode(StoryResponse.self, from: data)
    }

    func resolveAudioURL(_ audioURL: String?) -> URL? {
        guard let audioURL, !audioURL.isEmpty else { return nil }
        if audioURL.hasPrefix("http://") || audioURL.hasPrefix("https://") {
            return URL(string: audioURL)
        }
        let base = settings.backendURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)\(audioURL.hasPrefix("/") ? "" : "/")\(audioURL)")
    }

    private func authorizedData(for url: URL, method: String, body: Data?) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        if let token = try await getAccessToken(forceRefresh: false) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await session.data(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode == 401 {
            if let token = try await getAccessToken(forceRefresh: true) {
                var retry = request
                retry.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                return try await session.data(for: retry)
            }
            throw BackendError.unauthorized
        }
        return (data, response)
    }

    private func getAccessToken(forceRefresh: Bool) async throws -> String? {
        let cached = settings.readAuthState()
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        if !forceRefresh,
           !cached.accessToken.isEmpty,
           cached.expiresAtMs > now + tokenRefreshSkewMs {
            return cached.accessToken
        }
        return try await fetchToken(existingInstallId: settings.installId)
    }

    private func fetchToken(existingInstallId: String) async throws -> String? {
        let url = try apiURL(path: "v1/auth/token")
        let teamId = Bundle.main.object(forInfoDictionaryKey: "AppleTeamIdentifier") as? String ?? "DEVELOPMENT"
        let attestation = Self.iosAttestationHash(
            teamId: teamId,
            bundleId: Bundle.main.bundleIdentifier ?? "com.efirai.myapp"
        )

        let payload: [String: Any] = [
            "install_id": existingInstallId,
            "package_name": Bundle.main.bundleIdentifier ?? "com.efirai.myapp",
            "cert_sha256": attestation,
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
            "platform": "ios",
            "team_id": teamId,
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        for attempt in 0..<3 {
            do {
                let (data, response) = try await session.data(for: request)
                guard let http = response as? HTTPURLResponse else { throw BackendError.decodingFailed }
                if http.statusCode == 200 {
                    let tokenResponse = try decode(TokenResponse.self, from: data)
                    let expiresAtMs = nowMs() + Int64(tokenResponse.expiresIn) * 1000
                    settings.saveAuthToken(tokenResponse.accessToken, expiresAtMs: expiresAtMs)
                    return tokenResponse.accessToken
                }
                if attempt == 2 {
                    let message = String(data: data, encoding: .utf8)
                    throw BackendError.serverError(http.statusCode, message)
                }
            } catch let error as BackendError {
                throw error
            } catch {
                if attempt == 2 { throw BackendError.network(error) }
            }
            try await Task.sleep(nanoseconds: UInt64(1_500_000_000 * (attempt + 1)))
        }
        return nil
    }

    static func iosAttestationHash(teamId: String, bundleId: String) -> String {
        let input = "ios:\(bundleId):\(teamId)"
        let digest = SHA256.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private func apiURL(path: String) throws -> URL {
        let trimmed = settings.backendURL
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmed)/\(path)") else {
            throw BackendError.invalidURL
        }
        return url
    }

    private func healthURL() throws -> URL {
        let trimmed = settings.backendURL
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmed)/health") else {
            throw BackendError.invalidURL
        }
        return url
    }

    private func validateHTTP(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200...299).contains(http.statusCode) else {
            throw BackendError.serverError(http.statusCode, nil)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try JSONDecoder().decode(type, from: data)
        } catch {
            throw BackendError.decodingFailed
        }
    }

    private func nowMs() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }
}
