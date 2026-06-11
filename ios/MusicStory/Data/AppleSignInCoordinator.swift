import AuthenticationServices
import UIKit

enum AppleSignInError: LocalizedError {
    case cancelled
    case missingToken
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .cancelled:
            return "Вход через Apple отменён"
        case .missingToken:
            return "Не удалось получить токен Apple"
        case .failed(let message):
            return message
        }
    }
}

struct AppleSignInPayload: Sendable {
    let identityToken: String
    let userId: String
    let email: String?
}

@MainActor
final class AppleSignInCoordinator: NSObject {
    static let shared = AppleSignInCoordinator()

    private var continuation: CheckedContinuation<AppleSignInPayload, Error>?

    func signIn() async throws -> AppleSignInPayload {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation

            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.email, .fullName]

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<AppleSignInPayload, Error>) {
        switch result {
        case .success(let payload):
            continuation?.resume(returning: payload)
        case .failure(let error):
            continuation?.resume(throwing: error)
        }
        continuation = nil
    }
}

extension AppleSignInCoordinator: ASAuthorizationControllerDelegate {
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8),
              !identityToken.isEmpty else {
            finish(.failure(AppleSignInError.missingToken))
            return
        }
        finish(.success(AppleSignInPayload(
            identityToken: identityToken,
            userId: credential.user,
            email: credential.email
        )))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let ns = error as NSError
        if ns.domain == ASAuthorizationError.errorDomain,
           ns.code == ASAuthorizationError.canceled.rawValue {
            finish(.failure(AppleSignInError.cancelled))
            return
        }
        finish(.failure(AppleSignInError.failed(error.localizedDescription)))
    }
}

extension AppleSignInCoordinator: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for scene in scenes {
            if let window = scene.windows.first(where: { $0.isKeyWindow }) {
                return window
            }
        }
        return scenes.first?.windows.first ?? ASPresentationAnchor()
    }
}
