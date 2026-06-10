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

        let bot = botUsername.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "@", with: "")
        let base = widgetBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let pageBase = "\(base)/telegram-login"
        webView.loadHTMLString(Self.widgetHTML(bot: bot), baseURL: URL(string: pageBase))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func widgetHTML(bot: String) -> String {
        let safeBot = bot.replacingOccurrences(of: "[^a-zA-Z0-9_]", with: "", options: .regularExpression)
        return """
        <!DOCTYPE html>
        <html lang="ru">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
        <style>
          html,body{margin:0;min-height:100%;background:#1a1520;color:#f5efe6;font:16px system-ui,sans-serif}
          body{display:flex;flex-direction:column;align-items:center;padding:28px 12px 32px;box-sizing:border-box;text-align:center}
          #tg-wrap{min-height:72px;width:100%;display:flex;align-items:center;justify-content:center;margin-top:8px}
          .hint{color:rgba(245,239,230,.55);font-size:13px;line-height:1.45;margin:20px 0 0;max-width:280px}
          .err{color:#ff6b6b;font-size:13px;margin-top:12px}
        </style>
        </head>
        <body>
        <div id="tg-wrap"></div>
        <p class="hint">Нажмите кнопку — Telegram покажет «Принять» или «Отклонить».</p>
        <p class="err" id="err" hidden></p>
        <script>
        function onTelegramAuth(user) {
          if (!user || !user.hash) {
            var e = document.getElementById("err");
            if (e) { e.textContent = "Вход отменён."; e.hidden = false; }
            return;
          }
          if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.telegramAuth) {
            window.webkit.messageHandlers.telegramAuth.postMessage(user);
          }
        }
        function showErr(msg) {
          var e = document.getElementById("err");
          if (e) { e.textContent = msg; e.hidden = false; }
        }
        var s = document.createElement("script");
        s.async = true;
        s.src = "https://telegram.org/js/telegram-widget.js?22";
        s.setAttribute("data-telegram-login", "\(safeBot)");
        s.setAttribute("data-size", "large");
        s.setAttribute("data-radius", "12");
        s.setAttribute("data-onauth", "onTelegramAuth(user)");
        s.setAttribute("data-request-access", "write");
        s.onerror = function () { showErr("Не удалось загрузить Telegram. Проверьте интернет."); };
        document.getElementById("tg-wrap").appendChild(s);
        </script>
        </body>
        </html>
        """
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

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let host = navigationAction.request.url?.host?.lowercased() else {
                decisionHandler(.cancel)
                return
            }
            let allowed = ["telegram.org", "oauth.telegram.org", "t.me", "efir-ai.ru", "www.efir-ai.ru"]
                + allowedRailwayHosts()
            if allowed.contains(where: { host == $0 || host.hasSuffix(".\($0)") }) {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }

        private func allowedRailwayHosts() -> [String] {
            ["railway.app", "music-story-production.up.railway.app"]
        }
    }
}

struct TelegramLoginSheet: View {
    let botUsername: String
    let widgetBaseURL: String
    let onAuth: ([String: Any]) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            TelegramLoginWebView(
                botUsername: botUsername,
                widgetBaseURL: widgetBaseURL,
                onAuth: onAuth,
                onError: { _ in }
            )
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
