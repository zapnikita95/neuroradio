# Silero TTS — локально на ПК (не Railway)

Русский синтез **бесплатно** (модель v5_ru). BFF на **твоём компе** дергает Silero по `http://127.0.0.1:8001`. На Railway Silero **не ставим**.

## Быстрый старт (Windows)

### 1. Silero API

```bat
start-silero-tts.bat
```

Первый запуск: Docker скачает образ (~1 GB). API: **http://127.0.0.1:8001**

Голоса: `baya`, `kseniya`, `xenia` (ж), `aidar`, `eugene` (м).

### 2. Проверка русского (без телефона)

```bat
cd backend
npm run build
node scripts/test-silero-tts.mjs
```

Создаст `backend/data/audio/test-silero.ogg` — открой и послушай.

### 3. Локальный BFF

```bat
start-local-bff.bat
```

Уже выставлено:

```env
SILERO_TTS_ENABLED=true
SILERO_TTS_URL=http://127.0.0.1:8001
TTS_PREFER_SILERO=true
```

В приложении на телефоне: **URL backend = `http://<IP_ПК>:3000`** (не railway.app).

### 4. Остановка

```bat
stop-silero-tts.bat
stop-local-bff.bat
```

## Переменные BFF

| Переменная | Пример | Назначение |
|------------|--------|------------|
| `SILERO_TTS_ENABLED` | `true` | включить Silero |
| `SILERO_TTS_URL` | `http://127.0.0.1:8001` | silero-api-server |
| `SILERO_TTS_VOICE` | `baya` | голос |
| `TTS_PREFER_SILERO` | `true` | auto → Silero вместо Yandex |

Явно: `tts_provider: "silero"` в POST /v1/story/full.

## Railway + Silero на ПК (не сейчас)

Production Railway **не видит** `127.0.0.1` твоего ПК. Нужен туннель (ngrok / Cloudflare Tunnel) и `SILERO_TTS_URL=https://….`. Пока тест — **только локальный BFF**.

## Android TTS (тест в APK)

| Устройство | Реальность |
|------------|------------|
| **Google Pixel, Samsung с Google** | часто ок с «Speech Services by Google» + русский пакет |
| **Poco / MIUI** | часто **нет** норм. TTS в настройках; нужен Google TTS из Store |
| **Huawei без GMS** | **русского часто нет** — вариант **не для prod** |

Ориентир: **~60–70%** Android в РФ с Google-сервисами; MIUI/Huawei — плохой fit. Для free лучше **Silero на BFF** или Yandex premium.
