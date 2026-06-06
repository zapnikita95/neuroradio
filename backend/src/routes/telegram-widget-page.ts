/** Minimal page for Telegram Login Widget domain verification (efir-ai.ru → Railway). */
export function telegramBotUsername(): string | null {
  const u = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  return u || null;
}

export function buildTelegramWidgetPageHtml(botUsername: string): string {
  const bot = botUsername.replace(/[^a-zA-Z0-9_]/g, '').replace(/^_+/, '') || 'bot';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Music Story — Telegram</title>
<style>
  html,body{margin:0;min-height:100%;background:#1a1520;color:#f5efe6;font:16px system-ui,sans-serif}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;box-sizing:border-box;text-align:center}
  #tg-wrap{min-height:56px;display:flex;align-items:center;justify-content:center}
  p{color:rgba(245,239,230,.6);font-size:14px;line-height:1.5;max-width:320px;margin:20px 0 0}
</style>
</head>
<body>
<div id="tg-wrap"></div>
<p>Music Story — вход через Telegram</p>
<script>
function onTelegramAuth(user) {
  if (user && user.hash) {
    document.body.innerHTML = '<p style="padding:24px">Готово. Вернитесь в приложение Music Story.</p>';
  }
}
var s = document.createElement('script');
s.async = true;
s.src = 'https://telegram.org/js/telegram-widget.js?22';
s.setAttribute('data-telegram-login', '${bot}');
s.setAttribute('data-size', 'large');
s.setAttribute('data-radius', '12');
s.setAttribute('data-onauth', 'onTelegramAuth(user)');
s.setAttribute('data-request-access', 'write');
document.getElementById('tg-wrap').appendChild(s);
</script>
</body>
</html>`;
}
