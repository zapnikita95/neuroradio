import SwiftUI
import WebKit

enum TelegramWidgetURL {
    /// HTTPS origin for widget page — apex efir-ai.ru redirects to http://www (ATS block on iOS).
    static func normalizeBase(_ raw: String) -> String {
        var trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if trimmed.isEmpty { return "https://www.efir-ai.ru" }

        if !trimmed.lowercased().hasPrefix("http") {
            trimmed = "https://\(trimmed)"
        }
        trimmed = trimmed.replacingOccurrences(
            of: "^http://",
            with: "https://",
            options: [.regularExpression, .caseInsensitive]
        )

        guard var components = URLComponents(string: trimmed) else {
            return "https://www.efir-ai.ru"
        }
        components.scheme = "https"
        if components.host?.lowercased() == "efir-ai.ru" {
            components.host = "www.efir-ai.ru"
        }
        return components.url?.absoluteString
            .replacingOccurrences(of: "/$", with: "", options: .regularExpression)
            ?? "https://www.efir-ai.ru"
    }

    static func pageURL(base: String, bot: String) -> URL? {
        let trimmedBase = normalizeBase(base)
        let safeBot = bot.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: "")
        var components = URLComponents(string: "\(trimmedBase)/telegram-login")
        components?.queryItems = [
            URLQueryItem(name: "embed", value: "ios"),
            URLQueryItem(name: "bot", value: safeBot),
        ]
        return components?.url
    }

    static func upgradeToHTTPS(_ url: URL) -> URL {
        guard url.scheme?.lowercased() == "http",
              var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }
        parts.scheme = "https"
        return parts.url ?? url
    }
}

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

        if let url = TelegramWidgetURL.pageURL(base: widgetBaseURL, bot: botUsername) {
            webView.load(URLRequest(url: url))
        } else {
            onError("Некорректный URL для Telegram")
        }
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

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
            onError(userFacing(error))
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            onError(userFacing(error))
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if url.scheme?.lowercased() == "http" {
                let https = TelegramWidgetURL.upgradeToHTTPS(url)
                webView.load(URLRequest(url: https))
                decisionHandler(.cancel)
                return
            }

            guard let host = url.host?.lowercased() else {
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

        private func userFacing(_ error: Error) -> String {
            let ns = error as NSError
            if ns.domain == NSURLErrorDomain, ns.code == NSURLErrorAppTransportSecurityRequiresSecureConnection {
                return "Нужно HTTPS-соединение. Обновите приложение."
            }
            return error.localizedDescription
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
            ZStack {
                AppTheme.nightPlum.ignoresSafeArea()
                VStack(spacing: 0) {
                    TelegramLoginWebView(
                        botUsername: botUsername,
                        widgetBaseURL: widgetBaseURL,
                        onAuth: onAuth,
                        onError: { errorMessage = $0 }
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(AppTheme.errorCoral)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 20)
                            .padding(.bottom, 12)
                    }
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
        .presentationDetents([.fraction(0.55), .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(AppTheme.nightPlum)
    }
}
