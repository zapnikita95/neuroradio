/** Minimal page for Telegram Login Widget domain verification (efir-ai.ru → Railway). */
export function telegramBotUsername(): string | null {
  const u = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  return u || null;
}

export type TelegramWidgetEmbed = false | 'android' | 'ios';

export function buildTelegramWidgetPageHtml(
  botUsername: string,
  embed: TelegramWidgetEmbed = false,
): string {
  const bot = botUsername.replace(/[^a-zA-Z0-9_]/g, '').replace(/^_+/, '') || 'bot';
  const onAuthDone =
    embed === 'android'
      ? `if (window.MusicStoryAndroid && window.MusicStoryAndroid.onTelegramAuth) {
    window.MusicStoryAndroid.onTelegramAuth(JSON.stringify(user));
  }`
      : embed === 'ios'
        ? `if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.telegramAuth) {
    window.webkit.messageHandlers.telegramAuth.postMessage(user);
  }`
        : `document.body.innerHTML = '<p style="padding:24px">Готово. Вернитесь в приложение Эфир AI.</p>';`;
  const hint =
    embed === false
      ? 'Эфир AI — вход через Telegram'
      : 'Нажмите кнопку — Telegram покажет «Принять» или «Отклонить».';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Эфир AI — Telegram</title>
<style>
  html,body{margin:0;min-height:100%;background:#1a1520;color:#f5efe6;font:16px system-ui,sans-serif}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;box-sizing:border-box;text-align:center}
  #tg-wrap{min-height:56px;display:flex;align-items:center;justify-content:center}
  p{color:rgba(245,239,230,.6);font-size:14px;line-height:1.5;max-width:320px;margin:20px 0 0}
  .err{color:#ff6b6b;font-size:13px;margin-top:12px}
</style>
</head>
<body>
<div id="tg-wrap"></div>
<p>${hint}</p>
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
  ${onAuthDone}
}
var s = document.createElement('script');
s.async = true;
s.src = 'https://telegram.org/js/telegram-widget.js?22';
s.setAttribute('data-telegram-login', '${bot}');
s.setAttribute('data-size', 'large');
s.setAttribute('data-radius', '12');
s.setAttribute('data-onauth', 'onTelegramAuth(user)');
s.setAttribute('data-request-access', 'write');
s.onerror = function () { showErr('Не удалось загрузить Telegram. Проверьте интернет.'); };
document.getElementById('tg-wrap').appendChild(s);
setTimeout(function () {
  var w = document.getElementById('tg-wrap');
  if (w && !w.querySelector('iframe, a, button, script[src*="telegram-widget"]')) {
    showErr('Кнопка Telegram не загрузилась. В BotFather: /setdomain → efir-ai.ru');
  }
}, 4500);
</script>
</body>
</html>`;
}
