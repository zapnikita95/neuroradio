# Silero TTS — локально на ПК (не Railway)

## Один батник

```bat
START.bat
```

или `start-music-story.bat` — **всё само**:

1. Docker Desktop (запуск, если выключен)
2. Silero в Docker (русский v5_ru)
3. Локальный BFF + Ollama
4. **Cloudflare tunnel** — публичные URL для телефона и Railway

Остановка: `stop-music-story.bat`

После старта смотри вывод:

| Куда | URL |
|------|-----|
| **Телефон** | `https://….trycloudflare.com` → backend URL в приложении |
| **Railway Variables** | `SILERO_TTS_URL=https://….trycloudflare.com` (+ см. `logs/railway-silero.env.txt`) |

> URL туннеля **меняется** при каждом перезапуске батника — обнови Railway Variables.

## Без туннеля (только Wi-Fi)

Если cloudflared не скачался — батник покажет `http://192.168.x.x:3000` (телефон в той же сети).

## Тест Silero без телефона

```bat
cd backend
set SILERO_TTS_API=legacy
node scripts/test-silero-tts.mjs
```

→ `backend/data/audio/test-silero.wav`

## Переменные BFF

| Переменная | Значение |
|------------|----------|
| `SILERO_TTS_ENABLED` | `true` |
| `SILERO_TTS_URL` | локально `http://127.0.0.1:8001`, Railway — URL туннеля |
| `SILERO_TTS_API` | `legacy` |
| `TTS_PREFER_SILERO` | `true` |

## Android TTS

Poco/Huawei без Google TTS — **не для prod**. Silero + BFF надёжнее.

