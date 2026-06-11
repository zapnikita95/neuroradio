import SwiftUI
import WebKit

struct TelegramLoginWebView: UIViewRepresentable {
    let botUsername: String
    let widgetBaseURL: String
    let onAuth: ([String: Any]) -> Void
    let onError: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onAuth: onAuth, onError: onError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "telegramAuth")
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.navigationDelegate = context.coordinator

        if let url = Self.pageURL(base: widgetBaseURL, bot: botUsername) {
            webView.load(URLRequest(url: url))
        } else {
            onError("Некорректный URL для Telegram")
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func pageURL(base: String, bot: String) -> URL? {
        let trimmedBase = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let safeBot = bot.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: "")
        var components = URLComponents(string: "\(trimmedBase)/telegram-login")
        components?.queryItems = [
            URLQueryItem(name: "embed", value: "ios"),
            URLQueryItem(name: "bot", value: safeBot),
        ]
        return components?.url
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        private let onAuth: ([String: Any]) -> Void
        private let onError: (String) -> Void

        init(onAuth: @escaping ([String: Any]) -> Void, onError: @escaping (String) -> Void) {
            self.onAuth = onAuth
            self.onError = onError
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "telegramAuth", let body = message.body as? [String: Any] else { return }
            onAuth(body)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            onError(error.localizedDescription)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            onError(error.localizedDescription)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let host = navigationAction.request.url?.host?.lowercased() else {
                decisionHandler(.cancel)
                return
            }
            let allowed = [
                "telegram.org",
                "oauth.telegram.org",
                "t.me",
                "efir-ai.ru",
                "www.efir-ai.ru",
                "railway.app",
                "music-story-production.up.railway.app",
            ]
            if allowed.contains(where: { host == $0 || host.hasSuffix(".\($0)") }) {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }
    }
}

struct TelegramLoginSheet: View {
    let botUsername: String
    let widgetBaseURL: String
    let onAuth: ([String: Any]) -> Void
    let onDismiss: () -> Void

    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                TelegramLoginWebView(
                    botUsername: botUsername,
                    widgetBaseURL: widgetBaseURL,
                    onAuth: onAuth,
                    onError: { errorMessage = $0 }
                )
                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(AppTheme.errorCoral)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
            }
            .navigationTitle("Telegram")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Закрыть") { onDismiss() }
                        .foregroundStyle(AppTheme.accentViolet)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
