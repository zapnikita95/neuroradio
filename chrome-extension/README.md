# Эфир AI — расширение Chrome / Яндекс Браузер

Полный клиент BFF: как Android APK (озвучка Yandex, персонажи, лимиты, email).

## Возможности

| Вкладка | Что внутри |
|---------|------------|
| **Эфир** | Винил, трек, статус, текст истории, Рассказать / Стоп |
| **Озвучка** | Рассказчик, голос Yandex, скорость, интонация, авто-триггер |
| **Аккаунт** | Email + код, trial 7 дней, синхронизация с APK |
| **История** | Локальный список последних историй |

- Side panel (клик по иконке → панель справа)
- JWT `client_type: extension`
- `POST /v1/story/full` с `tts_voice`, `story_narrator`, `tts_speed`, `tts_emotion`
- Offscreen audio + пауза плеера на вкладке

## Установка

1. `chrome://extensions` → режим разработчика → **Загрузить распакованное** → папка `chrome-extension`
2. Клик по иконке → **панель справа** (или «Открыть панель» в popup)
3. Яндекс Музыка / Spotify / YouTube → трек → **Рассказать**

## ZIP для сайта

```powershell
Compress-Archive -Path "chrome-extension\*" -DestinationPath "efir-extension.zip" -Force
```

## Сервер

`ALLOW_DESKTOP_AUTH=true` или `DESKTOP_AUTH_SECRET` на Railway. Деплой с `client_type: extension` в auth.
