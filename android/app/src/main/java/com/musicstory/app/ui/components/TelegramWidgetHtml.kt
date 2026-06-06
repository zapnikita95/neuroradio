package com.musicstory.app.ui.components

/** Inline-страница Telegram Login Widget (как movieplanner-mobile). */
fun buildTelegramWidgetHtml(botUsername: String): String {
    val bot = botUsername.replace(Regex("[^a-zA-Z0-9_]"), "").trimStart('_').ifBlank { "bot" }
    return """
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  html, body { margin:0; min-height:100%; background:#1a1520; color:#f5efe6;
    font:16px system-ui,sans-serif; }
  body { display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:20px 16px 28px; box-sizing:border-box; text-align:center; }
  #tg-wrap { min-height:52px; display:flex; align-items:center; justify-content:center; }
  .hint { color:rgba(245,239,230,.55); font-size:13px; line-height:1.45; margin:16px 0 0; max-width:280px; }
  .err { color:#ff6b6b; font-size:13px; margin-top:12px; }
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
  if (window.MusicStoryAndroid && window.MusicStoryAndroid.onTelegramAuth) {
    window.MusicStoryAndroid.onTelegramAuth(JSON.stringify(user));
  }
}
function showErr(msg) {
  var e = document.getElementById("err");
  if (e) { e.textContent = msg; e.hidden = false; }
}
var s = document.createElement("script");
s.async = true;
s.src = "https://telegram.org/js/telegram-widget.js?22";
s.setAttribute("data-telegram-login", "$bot");
s.setAttribute("data-size", "large");
s.setAttribute("data-radius", "12");
s.setAttribute("data-onauth", "onTelegramAuth(user)");
s.setAttribute("data-request-access", "write");
s.onerror = function () { showErr("Не удалось загрузить Telegram. Проверьте интернет."); };
document.getElementById("tg-wrap").appendChild(s);
</script>
</body>
</html>
""".trimIndent()
}
