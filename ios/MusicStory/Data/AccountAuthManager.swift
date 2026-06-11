import Foundation

struct AccountProfile: Codable, Sendable {
    var accountId: String?
    var email: String?
    var appleSub: String?
    var telegramId: Int64?
    var telegramUsername: String?
    var plan: String?
    var trialUntil: Int64?
    var premiumUntil: Int64?

    var isLoggedIn: Bool {
        !(email?.isEmpty ?? true) ||
            !(appleSub?.isEmpty ?? true) ||
            (telegramId ?? 0) > 0
    }

    var displayName: String {
        if let email, !email.isEmpty { return email }
        if let username = telegramUsername, !username.isEmpty { return "@\(username)" }
        return "Аккаунт"
    }
}

struct AuthConfig: Sendable {
    let emailEnabled: Bool
    let telegramEnabled: Bool
    let appleSignInEnabled: Bool
    let telegramBotUsername: String?
    let telegramWidgetBaseUrl: String?

    var canUseTelegram: Bool {
        telegramEnabled
            && !(telegramBotUsername?.isEmpty ?? true)
            && !(telegramWidgetBaseUrl?.isEmpty ?? true)
    }
}

struct AccountLoginResult: Sendable {
    let profile: AccountProfile?
    let error: String?

    init(profile: AccountProfile? = nil, error: String? = nil) {
        self.profile = profile
        self.error = error
    }
}

@MainActor
final class AccountAuthManager {
    static let shared = AccountAuthManager()

    private let backend = BackendClient.shared
    private let settings = SettingsStore.shared

    private init() {}

    func fetchConfig() async -> AuthConfig? {
        do {
            let json = try await backend.fetchPublicJSON(path: "v1/public/auth-config")
            return AuthConfig(
                emailEnabled: json["emailEnabled"] as? Bool ?? true,
                telegramEnabled: json["telegramEnabled"] as? Bool ?? false,
                appleSignInEnabled: json["appleSignInEnabled"] as? Bool ?? true,
                telegramBotUsername: json["telegramBotUsername"] as? String,
                telegramWidgetBaseUrl: json["telegramWidgetBaseUrl"] as? String
            )
        } catch {
            return AuthConfig(
                emailEnabled: true,
                telegramEnabled: false,
                appleSignInEnabled: true,
                telegramBotUsername: nil,
                telegramWidgetBaseUrl: nil
            )
        }
    }

    func completeAppleSignIn(identityToken: String, email: String?) async -> AccountLoginResult {
        var payload: [String: Any] = ["identityToken": identityToken]
        if let email, !email.isEmpty {
            payload["email"] = email
        }
        let body = try? JSONSerialization.data(withJSONObject: payload)
        do {
            let data = try await backend.authorizedJSON(
                path: "v1/account/apple",
                method: "POST",
                body: body
            )
            if let err = data["error"] as? String, !err.isEmpty {
                return AccountLoginResult(error: err)
            }
            let profile = parseProfile(data["profile"] as? [String: Any] ?? data)
            settings.saveAccountProfile(profile)
            if let plan = profile.plan, !plan.isEmpty {
                settings.serverTier = plan
            }
            return AccountLoginResult(profile: profile)
        } catch let error as BackendError {
            return AccountLoginResult(error: error.errorDescription ?? UserFacingError.message(for: error))
        } catch {
            return AccountLoginResult(error: UserFacingError.message(for: error))
        }
    }

    func signInWithApple() async -> AccountLoginResult {
        do {
            let payload = try await AppleSignInCoordinator.shared.signIn()
            return await completeAppleSignIn(identityToken: payload.identityToken, email: payload.email)
        } catch let error as AppleSignInError {
            return AccountLoginResult(error: error.localizedDescription)
        } catch {
            return AccountLoginResult(error: UserFacingError.message(for: error))
        }
    }

    func linkTelegram(payload: [String: Any]) async -> AccountLoginResult {
        let body = try? JSONSerialization.data(withJSONObject: payload)
        do {
            let data = try await backend.authorizedJSON(
                path: "v1/account/telegram",
                method: "POST",
                body: body
            )
            if let err = data["error"] as? String, !err.isEmpty {
                return AccountLoginResult(error: err)
            }
            let profile = parseProfile(data["profile"] as? [String: Any] ?? data)
            settings.saveAccountProfile(profile)
            if let plan = profile.plan, !plan.isEmpty {
                settings.serverTier = plan
            }
            return AccountLoginResult(profile: profile)
        } catch {
            return AccountLoginResult(error: error.localizedDescription)
        }
    }

    func fetchProfile() async -> AccountLoginResult {
        do {
            let data = try await backend.authorizedJSON(path: "v1/account/profile", method: "GET", body: nil)
            let profile = parseProfile(data)
            settings.saveAccountProfile(profile)
            if let plan = profile.plan, !plan.isEmpty {
                settings.serverTier = plan
            }
            return AccountLoginResult(profile: profile)
        } catch {
            return AccountLoginResult(error: error.localizedDescription)
        }
    }

    func startEmailLogin(email: String) async -> String? {
        let payload = try? JSONSerialization.data(withJSONObject: ["email": email.trimmingCharacters(in: .whitespaces)])
        do {
            let data = try await backend.authorizedJSON(
                path: "v1/account/email/start",
                method: "POST",
                body: payload
            )
            if let err = data["error"] as? String, !err.isEmpty { return err }
            return nil
        } catch let error as BackendError {
            return error.errorDescription ?? UserFacingError.message(for: error)
        } catch {
            return UserFacingError.message(for: error)
        }
    }

    func verifyEmailLogin(email: String, code: String) async -> AccountLoginResult {
        let payload = try? JSONSerialization.data(withJSONObject: [
            "email": email.trimmingCharacters(in: .whitespaces),
            "code": code.trimmingCharacters(in: .whitespaces),
        ])
        do {
            let data = try await backend.authorizedJSON(
                path: "v1/account/email/verify",
                method: "POST",
                body: payload
            )
            if let err = data["error"] as? String, !err.isEmpty {
                return AccountLoginResult(error: err)
            }
            let profile = parseProfile(data["profile"] as? [String: Any] ?? data)
            settings.saveAccountProfile(profile)
            if let plan = profile.plan, !plan.isEmpty {
                settings.serverTier = plan
            }
            return AccountLoginResult(profile: profile)
        } catch let error as BackendError {
            return AccountLoginResult(error: error.errorDescription ?? UserFacingError.message(for: error))
        } catch {
            return AccountLoginResult(error: UserFacingError.message(for: error))
        }
    }

    private static func int64(_ value: Any?) -> Int64? {
        if let n = value as? Int64 { return n }
        if let n = value as? Int { return Int64(n) }
        if let n = value as? NSNumber { return n.int64Value }
        return nil
    }

    private func parseProfile(_ json: [String: Any]) -> AccountProfile {
        AccountProfile(
            accountId: json["accountId"] as? String,
            email: json["email"] as? String,
            appleSub: json["appleSub"] as? String,
            telegramId: Self.int64(json["telegramId"]),
            telegramUsername: json["telegramUsername"] as? String,
            plan: json["plan"] as? String,
            trialUntil: json["trialUntil"] as? Int64,
            premiumUntil: json["premiumUntil"] as? Int64
        )
    }
}
