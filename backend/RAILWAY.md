# Deploy на Railway (прокси Groq из РФ)

**GitHub:** https://github.com/zapnikita95/music-story

Railway крутит бэкенд **за рубежом** → Groq и Yandex работают, телефон стучится только на Railway.

## 1. Railway + GitHub

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Репозиторий: **`zapnikita95/music-story`**
3. **Root Directory:** оставь **пустым** (корень репо) — сборка идёт через **`Dockerfile`** в корне
4. Railway подхватит `railway.toml` и соберёт только `backend/`

## 2. Variables (Railway → Service → Variables)

| Variable | Значение |
|----------|----------|
| `GROQ_API_KEY` | `gsk_...` |
| `YANDEX_API_KEY` | `AQVN...` |
| `YANDEX_FOLDER_ID` | `b1g0...` (каталог сервисного аккаунта!) |
| `PORT` | Railway подставит сам — **не трогай** |

**Всё.** JWT, подпись APK и обновление токена — **автоматически**:

- `AUTH_JWT_SECRET` **не нужен** — сервер выводит его из `GROQ_API_KEY`
- `ALLOWED_CERT_SHA256` **не нужен** для debug APK — fingerprint уже в коде бэкенда
- `PROXY_SECRET` **удали**, если остался — больше не используется
- **Ничего не меняй раз в месяц** — приложение само обновляет JWT в фоне

### Опционально (только Play Store release)

Когда выложишь в Store с **другим** signing key — добавь release fingerprint в `ALLOWED_CERT_SHA256` **один раз**:

```powershell
keytool -list -v -keystore path\to\release.keystore -alias YOUR_ALIAS
```

## 3. URL

Settings → Networking → **Generate Domain** → скопируй, напр.  
`https://music-story-production.up.railway.app`

Проверка:

```bash
curl https://ТВОЙ-DOMAIN.up.railway.app/health
```

Должно быть `"groq": true`, `"appAuthRequired": true`, `"appAuthAuto": true`.

## 4. Приложение на телефоне

**Ничего настраивать не нужно:**

- URL Railway уже по умолчанию
- JWT получается при запуске и обновляется каждые 3 дня в фоне
- Groq ключ на телефоне не нужен

## Безопасность (Play Store)

| Защита | Что делает |
|--------|------------|
| JWT по подписи APK | Чужие клиенты не получат токен |
| Rate limit | 10 историй/час, 50/день на установку + лимит по IP |
| Signed audio URLs | `/audio/*` только с `?sig=&exp=` (1 час) |
| Groq proxy **удалён** | Нельзя сжечь твой Groq произвольными промптами |
| Валидация входа | artist/title ≤200 символов, без oversized JSON |
| Security headers | nosniff, no-store, no CORS для браузерного спама |

```
APK → JWT → POST /v1/story/full only
    → signed audio URL → ExoPlayer
```

- Секреты Groq/Yandex **только на Railway**
- В APK **нет** shared secret
- **ALLOW_DEBUG_CERT=false** + release fingerprint — перед публичным релизом в Store

## Как это работает

```
Телефон (РФ) → Railway (EU/US) → Groq API ✅
                              → Yandex TTS ✅
```

Прямой вызов `api.groq.com` с телефона/ПК из РФ → 403 (геоблок).
