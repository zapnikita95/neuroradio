import SwiftUI
import WebKit

struct TelegramLoginWebView: UIViewRepresentable {
    let botUsername: String
    let onAuth: ([String: Any]) -> Void
    let onError: (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onAuth: onAuth, onError: onError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = true
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "telegramAuth")
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 26 / 255, green: 21 / 255, blue: 32 / 255, alpha: 1)
        webView.scrollView.backgroundColor = .clear
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator

        let html = TelegramWidgetHtml.build(botUsername: botUsername)
        let base = URL(string: TelegramWidgetHtml.widgetOrigin)!
        webView.loadHTMLString(html, baseURL: base)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
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

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
            }
            return nil
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if url.scheme?.lowercased() == "http" {
                var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
                parts?.scheme = "https"
                if let https = parts?.url {
                    webView.load(URLRequest(url: https))
                }
                decisionHandler(.cancel)
                return
            }

            if let host = url.host?.lowercased() {
                let allowed = [
                    "telegram.org",
                    "oauth.telegram.org",
                    "t.me",
                    "efir-ai.ru",
                    "www.efir-ai.ru",
                ]
                if allowed.contains(where: { host == $0 || host.hasSuffix(".\($0)") }) {
                    decisionHandler(.allow)
                    return
                }
            }

            if url.scheme == "about" || url.scheme == "data" {
                decisionHandler(.allow)
                return
            }

            decisionHandler(.cancel)
        }

        private func userFacing(_ error: Error) -> String {
            let ns = error as NSError
            if ns.domain == NSURLErrorDomain, ns.code == NSURLErrorAppTransportSecurityRequiresSecureConnection {
                return "Нужно HTTPS. Обновите приложение."
            }
            return error.localizedDescription
        }
    }
}

struct TelegramLoginSheet: View {
    let botUsername: String
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
                        onAuth: onAuth,
                        onError: { errorMessage = $0 }
                    )
                    .frame(minHeight: 260)

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
        .presentationDetents([.height(340), .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(AppTheme.nightPlum)
    }
}
