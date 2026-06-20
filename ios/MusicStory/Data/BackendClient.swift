import Foundation
import CryptoKit
import os

private let backendLog = Logger(subsystem: "com.efirai.myapp", category: "Backend")

struct LoginPrepResult: Sendable {
    let ready: Bool
    let error: String?
}

private func friendlyNetworkMessage(_ error: Error) -> String {
    let ns = error as NSError
    if ns.domain == NSURLErrorDomain {
        switch ns.code {
        case NSURLErrorSecureConnectionFailed,
             NSURLErrorServerCertificateUntrusted,
             NSURLErrorServerCertificateHasBadDate,
             NSURLErrorServerCertificateNotYetValid,
             NSURLErrorClientCertificateRequired:
            return "Не удалось подключиться к серверу. Проверьте интернет и обновите iOS."
        case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
            return "Сервер не найден. Проверьте интернет."
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
            return "Нет подключения к интернету."
        case NSURLErrorTimedOut:
            return "Сервер не отвечает. Попробуйте ещё раз."
        default:
            break
        }
    }
    return error.localizedDescription
}

enum AppLegalURLs {
    static let privacyPolicy = URL(string: "https://www.efir-ai.ru/docs/privacy.html")!
    static let termsOfUse = URL(string: "https://www.efir-ai.ru/docs/terms.html")!
}

enum BackendURL {
    /// Прод BFF (LE E7, *.up.railway.app).
    static let production = "https://music-story-production.up.railway.app"
    /// Запасной — тот же BFF через кастомный домен (если railway.app режется/SSL на сети).
    static let websiteAPI = "https://www.efir-ai.ru"
    static let canonical = production

    static func normalize(_ raw: String) -> String {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { return canonical }
        if !value.lowercased().hasPrefix("http") {
            value = "https://\(value)"
        }
        value = value.replacingOccurrences(of: "http://", with: "https://")
        value = value.replacingOccurrences(
            of: "neuroradio-production.up.railway.app",
            with: production.replacingOccurrences(of: "https://", with: "")
        )
        guard let url = URL(string: value), let host = url.host?.lowercased() else {
            return canonical
        }
        // Сайт на www; API в приложении — напрямую на Railway (сертификат *.up.railway.app).
        if host == "efir-ai.ru" || host == "www.efir-ai.ru" {
            return canonical
        }
        var parts = url.path.split(separator: "/").map(String.init)
        while let last = parts.last, last.isEmpty { parts.removeLast() }
        let path = parts.isEmpty ? "" : "/" + parts.joined(separator: "/")
        return "https://\(host)\(path)"
    }

    static func candidateBases(preferred: String) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for raw in [preferred, canonical, websiteAPI] {
            let base = raw == websiteAPI ? websiteAPI : normalize(raw)
            if seen.insert(base).inserted {
                result.append(base)
            }
        }
        return result
    }

    static func url(base: String, path: String) -> URL? {
        let trimmedBase = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let trimmedPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        return URL(string: "\(trimmedBase)/\(trimmedPath)")
    }
}

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
            if let message, !message.isEmpty {
                return UserFacingError.message(for: message)
            }
            if code == 503 || code == 504 {
                return "Сервер долго не отвечает. Попробуйте ещё раз через минуту."
            }
            return "Сервер временно недоступен (\(code))."
        case .decodingFailed:
            return "Некорректный ответ сервера"
        case .network(let error):
            return friendlyNetworkMessage(error)
        }
    }
}

@MainActor
final class BackendClient {
    static let shared = BackendClient()

    private let apiSession: URLSession
    private let longSession: URLSession
    private let probeSession: URLSession
    private let settings = SettingsStore.shared
    private let tokenRefreshSkewMs: Int64 = 7 * 24 * 60 * 60 * 1000

    private static let storyRequestTimeout: TimeInterval = 120
    private static let storyResourceTimeout: TimeInterval = 180
    private static let apiRequestTimeout: TimeInterval = 90
    private static let apiResourceTimeout: TimeInterval = 180
    private static let authRequestTimeout: TimeInterval = 35
    private static let probeTimeout: TimeInterval = 12

    private var lastReachableBackendProbeAt: Date?
    private static let backendProbeTTL: TimeInterval = 45

    private init() {
        let apiConfig = URLSessionConfiguration.default
        apiConfig.timeoutIntervalForRequest = Self.apiRequestTimeout
        apiConfig.timeoutIntervalForResource = Self.apiResourceTimeout
        apiConfig.waitsForConnectivity = false
        apiConfig.allowsConstrainedNetworkAccess = true
        apiConfig.allowsExpensiveNetworkAccess = true
        apiSession = URLSession(configuration: apiConfig)

        let longConfig = URLSessionConfiguration.default
        longConfig.timeoutIntervalForRequest = Self.storyRequestTimeout
        longConfig.timeoutIntervalForResource = Self.storyResourceTimeout
        longConfig.waitsForConnectivity = false
        longConfig.allowsConstrainedNetworkAccess = true
        longConfig.allowsExpensiveNetworkAccess = true
        longSession = URLSession(configuration: longConfig)

        let probeConfig = URLSessionConfiguration.ephemeral
        probeConfig.timeoutIntervalForRequest = Self.probeTimeout
        probeConfig.timeoutIntervalForResource = Self.probeTimeout
        probeConfig.waitsForConnectivity = false
        probeConfig.allowsConstrainedNetworkAccess = true
        probeConfig.allowsExpensiveNetworkAccess = true
        probeSession = URLSession(configuration: probeConfig)
    }

    private func session(for path: String) -> URLSession {
        path == "v1/story/full" ? longSession : apiSession
    }

    func warmUp() async {
        _ = await prepareForLogin()
    }

    func prepareForLogin() async -> LoginPrepResult {
        settings.backendURL = BackendURL.canonical
        if let result = await tryLoginOnCandidates() {
            return result
        }
        return LoginPrepResult(
            ready: false,
            error: "Не удалось подключиться к серверу. Выключите VPN и режим экономии трафика, проверьте дату и время, попробуйте мобильный интернет вместо Wi‑Fi."
        )
    }

    private func tryLoginOnCandidates() async -> LoginPrepResult? {
        for base in BackendURL.candidateBases(preferred: settings.backendURL) {
            settings.backendURL = base
            await selectReachableBackend(preferred: base)
            do {
                _ = try await getAccessToken(forceRefresh: false)
                backendLog.info("login ready base=\(base, privacy: .public)")
                lastReachableBackendProbeAt = Date()
                return LoginPrepResult(ready: true, error: nil)
            } catch let error as BackendError {
                backendLog.error("login failed base=\(base, privacy: .public) err=\(error.localizedDescription, privacy: .public)")
                if case .network(let underlying) = error, Self.isRetryableNetworkError(underlying) {
                    continue
                }
                if case .serverError(403, _) = error { continue }
                return LoginPrepResult(ready: false, error: Self.loginErrorMessage(error, base: base))
            } catch {
                if Self.isRetryableNetworkError(error) { continue }
                return LoginPrepResult(ready: false, error: Self.loginErrorMessage(.network(error), base: base))
            }
        }
        return nil
    }

    func selectReachableBackend(preferred: String? = nil) async {
        if let lastReachableBackendProbeAt,
           Date().timeIntervalSince(lastReachableBackendProbeAt) < Self.backendProbeTTL {
            return
        }
        for base in BackendURL.candidateBases(preferred: preferred ?? settings.backendURL) {
            guard let url = BackendURL.url(base: base, path: "health") else { continue }
            do {
                let (_, response) = try await probeSession.data(from: url)
                guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                    backendLog.warning("health bad status base=\(base, privacy: .public)")
                    continue
                }
                if settings.backendURL != base {
                    settings.backendURL = base
                }
                lastReachableBackendProbeAt = Date()
                backendLog.info("backend selected base=\(base, privacy: .public)")
                return
            } catch {
                let ns = error as NSError
                backendLog.error("health failed base=\(base, privacy: .public) code=\(ns.code) err=\(error.localizedDescription, privacy: .public)")
                if Self.isRetryableNetworkError(error) { continue }
            }
        }
        backendLog.error("no reachable backend")
    }

    private static func loginErrorMessage(_ error: BackendError, base: String) -> String {
        switch error {
        case .network(let underlying):
            let ns = underlying as NSError
            if ns.domain == NSURLErrorDomain {
                switch ns.code {
                case NSURLErrorSecureConnectionFailed,
                     NSURLErrorServerCertificateUntrusted,
                     NSURLErrorServerCertificateHasBadDate,
                     NSURLErrorServerCertificateNotYetValid:
                    return "Не удалось подключиться к серверу. Проверьте интернет, дату и время на iPhone, или попробуйте другую сеть."
                case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
                    return "Нет интернета. Проверьте Wi‑Fi или мобильную сеть."
                case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
                    return "Сервер не найден. Попробуйте другую сеть."
                case NSURLErrorTimedOut:
                    return "Сервер не отвечает. Попробуйте ещё раз."
                default:
                    break
                }
            }
            return "Сервер недоступен. Проверьте интернет."
        case .serverError(403, _):
            return "Приложение не авторизовано на сервере. Обновите приложение из TestFlight."
        case .serverError(503, let message) where message?.contains("not configured") == true:
            return "Сервер временно не настроен. Попробуйте позже."
        case .unauthorized:
            return "Не удалось получить доступ. Перезапустите приложение."
        default:
            return error.localizedDescription
        }
    }

    func fetchHealth() async throws -> HealthResponse {
        let (data, response) = try await dataFromAPI(path: "health", method: "GET", body: nil, authorized: false)
        try validateHTTP(response)
        return try decode(HealthResponse.self, from: data)
    }

    func fetchQuota() async throws -> QuotaResponse {
        let (data, response) = try await dataFromAPI(path: "v1/story/quota", method: "GET", body: nil, authorized: true)
        try validateHTTP(response)
        return try decode(QuotaResponse.self, from: data)
    }

    func fetchFullStory(request: StoryRequest) async throws -> StoryResponse {
        let body = try JSONEncoder().encode(request)
        let (data, response) = try await dataFromAPI(path: "v1/story/full", method: "POST", body: body, authorized: true)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw BackendError.serverError(http.statusCode, Self.parseErrorMessage(from: data))
        }
        return try decode(StoryResponse.self, from: data)
    }

    func submitStoryPlaybackComplete(
        artist: String,
        title: String,
        script: String,
        seedFact: String,
        seedScope: String?,
        seedInterestScore: Int?,
        seedInterestRating: Int?,
        storyNarrator: String?
    ) async {
        var payload: [String: Any] = [
            "artist": artist,
            "title": title,
            "script": script,
            "seed_fact": seedFact,
        ]
        if let seedScope, !seedScope.isEmpty { payload["seed_scope"] = seedScope }
        if let seedInterestScore { payload["seed_interest_score"] = seedInterestScore }
        if let seedInterestRating { payload["seed_interest_rating"] = seedInterestRating }
        if let storyNarrator, !storyNarrator.isEmpty { payload["story_narrator"] = storyNarrator }
        let body = try? JSONSerialization.data(withJSONObject: payload)
        _ = try? await dataFromAPI(path: "v1/story/complete", method: "POST", body: body, authorized: true)
    }

    func submitStoryFeedback(_ request: StoryFeedbackRequest) async throws {
        let body = try JSONEncoder().encode(request)
        let (_, response) = try await dataFromAPI(path: "v1/story/feedback", method: "POST", body: body, authorized: true)
        try validateHTTP(response)
    }

    func createYooKassaPayment(email: String, plan: String) async throws -> PaymentCreateResponse {
        let body = try JSONEncoder().encode(PaymentCreateRequest(email: email, plan: plan))
        let (data, response) = try await dataFromAPI(
            path: "v1/public/payment/create",
            method: "POST",
            body: body,
            authorized: false
        )
        try validateHTTP(response)
        return try decode(PaymentCreateResponse.self, from: data)
    }

    func deleteAccount() async throws {
        let (_, response) = try await dataFromAPI(
            path: "v1/account/account",
            method: "DELETE",
            body: nil,
            authorized: true
        )
        try validateHTTP(response)
    }

    func verifyAppStorePurchase(receiptData: String) async throws -> IapVerifyResponse {
        let body = try JSONEncoder().encode(AppStoreVerifyRequest(receiptData: receiptData))
        let (data, response) = try await dataFromAPI(
            path: "v1/billing/verify/app-store",
            method: "POST",
            body: body,
            authorized: true
        )
        try validateHTTP(response)
        return try decode(IapVerifyResponse.self, from: data)
    }

    func fetchFactHint(artist: String, title: String) async throws -> FactHintResponse {
        let encodedArtist = artist.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? artist
        let encodedTitle = title.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? title
        let path = "v1/facts/hint?artist=\(encodedArtist)&title=\(encodedTitle)"
        let (data, response) = try await dataFromAPI(path: path, method: "GET", body: nil, authorized: true)
        try validateHTTP(response)
        return try decode(FactHintResponse.self, from: data)
    }

    func fetchBillingStatus() async throws -> BillingStatusResponse {
        let (data, response) = try await dataFromAPI(path: "v1/billing/status", method: "GET", body: nil, authorized: true)
        try validateHTTP(response)
        return try decode(BillingStatusResponse.self, from: data)
    }

    func verifyApplePurchase(
        signedTransactionInfo: String,
        transactionId: String,
        productId: String,
        originalTransactionId: String,
        expiresDateMs: Int64?,
        bundleId: String,
        environment: String
    ) async throws -> BillingStatusResponse {
        var payload: [String: Any] = [
            "signedTransactionInfo": signedTransactionInfo,
            "transactionId": transactionId,
            "productId": productId,
            "originalTransactionId": originalTransactionId,
            "bundleId": bundleId,
            "environment": environment,
        ]
        if let expiresDateMs {
            payload["expiresDateMs"] = expiresDateMs
        }
        let storedLang = UserDefaults.standard.string(forKey: "app_language") ?? "system"
        let appLang = AppLanguage.fromId(storedLang)
        payload["appLanguage"] = resolveAppLanguage(appLang).apiCode
        let body = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await dataFromAPI(
            path: "v1/billing/apple/verify",
            method: "POST",
            body: body,
            authorized: true
        )
        try validateHTTP(response)
        return try decode(BillingStatusResponse.self, from: data)
    }

    func authorizedJSON(path: String, method: String, body: Data?) async throws -> [String: Any] {
        await selectReachableBackend()
        let (data, response) = try await dataFromAPI(
            path: path,
            method: method,
            body: body,
            authorized: true,
            requestTimeout: Self.authRequestTimeout
        )
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw BackendError.serverError(http.statusCode, Self.parseErrorMessage(from: data))
        }
        let obj = try JSONSerialization.jsonObject(with: data)
        return obj as? [String: Any] ?? [:]
    }

    private static func parseErrorMessage(from data: Data) -> String? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return String(data: data, encoding: .utf8)
        }
        if let err = obj["error"] as? String, !err.isEmpty { return err }
        if let msg = obj["message"] as? String, !msg.isEmpty { return msg }
        return nil
    }

    func fetchPublicJSON(path: String) async throws -> [String: Any] {
        let (data, response) = try await dataFromAPI(path: path, method: "GET", body: nil, authorized: false)
        try validateHTTP(response)
        let obj = try JSONSerialization.jsonObject(with: data)
        return obj as? [String: Any] ?? [:]
    }

    func resolveAudioURL(_ audioURL: String?) -> URL? {
        guard let audioURL, !audioURL.isEmpty else { return nil }
        if audioURL.hasPrefix("http://") || audioURL.hasPrefix("https://") {
            return URL(string: audioURL)
        }
        let base = BackendURL.normalize(settings.backendURL)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return URL(string: "\(base)\(audioURL.hasPrefix("/") ? "" : "/")\(audioURL)")
    }

    private func dataFromAPI(
        path: String,
        method: String,
        body: Data?,
        authorized: Bool,
        requestTimeout: TimeInterval? = nil
    ) async throws -> (Data, URLResponse) {
        var lastError: Error?
        for base in BackendURL.candidateBases(preferred: settings.backendURL) {
            guard let url = BackendURL.url(base: base, path: path) else { continue }
            var request = URLRequest(url: url)
            request.httpMethod = method
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
            if let requestTimeout {
                request.timeoutInterval = requestTimeout
            }

            if authorized, let token = try await getAccessToken(forceRefresh: false) {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            do {
                let (data, response) = try await session(for: path).data(for: request)
                if let http = response as? HTTPURLResponse, http.statusCode == 401, authorized {
                    if let token = try await getAccessToken(forceRefresh: true) {
                        var retry = request
                        retry.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                        let (retryData, retryResponse) = try await session(for: path).data(for: retry)
                        settings.backendURL = base
                        lastReachableBackendProbeAt = Date()
                        return (retryData, retryResponse)
                    }
                    throw BackendError.unauthorized
                }
                settings.backendURL = base
                lastReachableBackendProbeAt = Date()
                return (data, response)
            } catch let error as BackendError {
                throw error
            } catch {
                lastError = error
                if Self.isRetryableNetworkError(error) { continue }
                throw BackendError.network(error)
            }
        }
        throw BackendError.network(lastError ?? URLError(.cannotConnectToHost))
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
        await selectReachableBackend()

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

        let body = try JSONSerialization.data(withJSONObject: payload)
        var lastError: Error?

        for base in BackendURL.candidateBases(preferred: settings.backendURL) {
            guard let url = BackendURL.url(base: base, path: "v1/auth/token") else { continue }
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body

            for attempt in 0..<2 {
                do {
                    let (data, response) = try await apiSession.data(for: request)
                    guard let http = response as? HTTPURLResponse else { throw BackendError.decodingFailed }
                    if http.statusCode == 200 {
                        let tokenResponse = try decode(TokenResponse.self, from: data)
                        let expiresAtMs = nowMs() + Int64(tokenResponse.expiresIn) * 1000
                        settings.saveAuthToken(tokenResponse.accessToken, expiresAtMs: expiresAtMs)
                        settings.backendURL = base
                        return tokenResponse.accessToken
                    }
                    if http.statusCode == 403 || http.statusCode == 400 {
                        let message = String(data: data, encoding: .utf8)
                        throw BackendError.serverError(http.statusCode, message)
                    }
                    if attempt == 1 {
                        let message = String(data: data, encoding: .utf8)
                        throw BackendError.serverError(http.statusCode, message)
                    }
                } catch let error as BackendError {
                    throw error
                } catch {
                    lastError = error
                    if attempt == 1 && Self.isRetryableNetworkError(error) { break }
                    if attempt == 1 { throw BackendError.network(error) }
                }
                try? await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }

        throw BackendError.network(lastError ?? URLError(.cannotConnectToHost))
    }

    static func iosAttestationHash(teamId: String, bundleId: String) -> String {
        let input = "ios:\(bundleId):\(teamId)"
        let digest = SHA256.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private static func isRetryableNetworkError(_ error: Error) -> Bool {
        let ns = error as NSError
        guard ns.domain == NSURLErrorDomain else { return false }
        switch ns.code {
        case NSURLErrorSecureConnectionFailed,
             NSURLErrorServerCertificateUntrusted,
             NSURLErrorServerCertificateHasBadDate,
             NSURLErrorServerCertificateNotYetValid,
             NSURLErrorCannotConnectToHost,
             NSURLErrorNetworkConnectionLost,
             NSURLErrorTimedOut,
             NSURLErrorDNSLookupFailed,
             NSURLErrorCannotFindHost:
            return true
        default:
            return false
        }
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
