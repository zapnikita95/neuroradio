import Foundation

/// Inline-страница Telegram Login Widget — как movieplanner-mobile (`baseUrl` + HTML, без редиректов).
enum TelegramWidgetHtml {
    /// Домен BotFather `/setdomain` — origin WebView.
    static let widgetOrigin = "https://efir-ai.ru"

    static func build(botUsername: String) -> String {
        let bot = botUsername
            .trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "@", with: "")
            .replacingOccurrences(of: "[^a-zA-Z0-9_]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "^_+", with: "", options: .regularExpression)
        let safeBot = bot.isEmpty ? "bot" : bot

        return """
        <!DOCTYPE html>
        <html lang="ru">
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
        <style>
          html,body{margin:0;min-height:100%;background:#1a1520;color:#f5efe6;font:16px -apple-system,sans-serif}
          body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 16px;box-sizing:border-box;text-align:center}
          #tg-wrap{min-height:56px;display:flex;align-items:center;justify-content:center}
          .hint{color:rgba(245,239,230,.55);font-size:13px;line-height:1.45;margin:16px 0 0;max-width:280px}
          .err{color:#ff6b6b;font-size:13px;margin-top:12px}
        </style>
        </head>
        <body>
        <div id="tg-wrap"></div>
        <p class="hint">Нажмите кнопку — Telegram покажет «Принять» или «Отклонить».</p>
        <p class="err" id="err" hidden></p>
        <script>
        function showErr(msg) {
          var e = document.getElementById('err');
          if (e) { e.textContent = msg; e.hidden = false; }
        }
        function onTelegramAuth(user) {
          if (!user || !user.hash) {
            showErr('Вход отменён.');
            return;
          }
          if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.telegramAuth) {
            window.webkit.messageHandlers.telegramAuth.postMessage(user);
          } else {
            showErr('Не удалось передать данные в приложение.');
          }
        }
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://telegram.org/js/telegram-widget.js?22';
        s.setAttribute('data-telegram-login', '\(safeBot)');
        s.setAttribute('data-size', 'large');
        s.setAttribute('data-radius', '12');
        s.setAttribute('data-onauth', 'onTelegramAuth(user)');
        s.setAttribute('data-request-access', 'write');
        s.onerror = function () { showErr('Не удалось загрузить Telegram. Проверьте интернет.'); };
        document.getElementById('tg-wrap').appendChild(s);
        setTimeout(function () {
          var w = document.getElementById('tg-wrap');
          if (w && !w.querySelector('iframe, a, button')) {
            showErr('Кнопка Telegram не загрузилась. Проверьте домен efir-ai.ru в BotFather.');
          }
        }, 5000);
        </script>
        </body>
        </html>
        """
    }
}
