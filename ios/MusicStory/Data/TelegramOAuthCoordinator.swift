import AuthenticationServices
import CryptoKit
import UIKit
import os

private let telegramLog = Logger(subsystem: "com.efirai.myapp", category: "TelegramOAuth")

enum TelegramOAuthError: LocalizedError {
    case cancelled
    case missingConfig
    case missingCode
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .cancelled:
            return "Вход через Telegram отменён"
        case .missingConfig:
            return "Telegram OAuth не настроен на сервере"
        case .missingCode:
            return "Не удалось получить код Telegram"
        case .failed(let message):
            return message
        }
    }
}

@MainActor
final class TelegramOAuthCoordinator: NSObject {
    static let shared = TelegramOAuthCoordinator()

    private var session: ASWebAuthenticationSession?
    private var continuation: CheckedContinuation<String, Error>?

    func signIn(clientId: String, redirectUri: String) async throws -> (code: String, codeVerifier: String) {
        let verifier = Self.makeCodeVerifier()
        let challenge = Self.makeCodeChallenge(verifier: verifier)

        guard var components = URLComponents(string: "https://oauth.telegram.org/auth") else {
            throw TelegramOAuthError.failed("Некорректный URL OAuth")
        }
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid profile"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        guard let authURL = components.url else {
            throw TelegramOAuthError.failed("Не удалось собрать URL OAuth")
        }

        telegramLog.info("start client_id=\(clientId, privacy: .public) redirect=\(redirectUri, privacy: .public)")

        let code = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
            self.continuation = cont
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: "efirai"
            ) { [weak self] callbackURL, error in
                Task { @MainActor in
                    self?.handleCallback(callbackURL: callbackURL, error: error)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.finish(.failure(TelegramOAuthError.failed("Не удалось открыть окно Telegram")))
            }
        }

        telegramLog.info("callback code_len=\(code.count)")
        return (code: code, codeVerifier: verifier)
    }

    private func handleCallback(callbackURL: URL?, error: Error?) {
        if let error {
            let ns = error as NSError
            if ns.domain == ASWebAuthenticationSessionErrorDomain,
               ns.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                finish(.failure(TelegramOAuthError.cancelled))
                return
            }
            telegramLog.error("session error: \(error.localizedDescription, privacy: .public)")
            finish(.failure(TelegramOAuthError.failed(error.localizedDescription)))
            return
        }
        guard let callbackURL,
              let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
              !code.isEmpty else {
            telegramLog.error("callback missing code url=\(callbackURL?.absoluteString ?? "nil", privacy: .public)")
            finish(.failure(TelegramOAuthError.missingCode))
            return
        }
        finish(.success(code))
    }

    private func finish(_ result: Result<String, Error>) {
        session = nil
        switch result {
        case .success(let code):
            continuation?.resume(returning: code)
        case .failure(let error):
            continuation?.resume(throwing: error)
        }
        continuation = nil
    }

    private static func makeCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return base64URLEncode(Data(bytes))
    }

    private static func makeCodeChallenge(verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return base64URLEncode(Data(digest))
    }

    private static func base64URLEncode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension TelegramOAuthCoordinator: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for scene in scenes {
            if let window = scene.windows.first(where: { $0.isKeyWindow }) {
                return window
            }
        }
        return scenes.first?.windows.first ?? ASPresentationAnchor()
    }
}
