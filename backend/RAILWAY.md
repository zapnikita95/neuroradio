# Deploy на Railway (прокси Groq из РФ)

**GitHub:** https://github.com/zapnikita95/music-story

Railway крутит бэкенд **за рубежом** → Groq и Yandex работают, телефон стучится только на Railway.

## 1. Railway + GitHub

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Репозиторий: **`zapnikita95/music-story`**
3. **Root Directory:** **пустой** (корень репо) **или** `backend` — оба варианта собираются через **Dockerfile** (не Nixpacks без `tsc`)
4. **Start Command** в Railway Settings → Deploy: `node dist/index.js` (не `npm start` — иначе в логах ложный `npm error signal SIGTERM` при редеплое)
5. Railway подхватит `railway.toml` и соберёт TypeScript в `dist/`

## 2. Variables (Railway → Service → Variables)

| Variable | Значение |
|----------|----------|
| `OPEN_ROUTER_API_KEY` | `sk-or-v1-...` (если в приложении выбран OpenRouter) |
| `LLM_PROVIDER` | `openrouter` (или `groq` / `gemini`) |
| `GROQ_API_KEY` | `gsk_...` (fallback / JWT) |
| `YANDEX_API_KEY` | `AQVN...` |
| `YANDEX_FOLDER_ID` | `b1g0...` (каталог сервисного аккаунта!) |
| `PORT` | Railway подставит сам — **не трогай** |
| `DATABASE_URL` | **Railway Postgres** — story_history, used_seeds, feedback, fact_misses, accounts kv |
| `ACCOUNT_DATA_DIR` | Volume `/data` — **facts-bank.json** + **audio/** (кэш фактов и озвучка) |

**Volume + Postgres (рекомендуется):**
- **Postgres** — история историй, used seeds, feedback, fact-misses, accounts (без history в blob)
- **Volume** `/data` + `ACCOUNT_DATA_DIR=/data` — facts-bank.json и audio .ogg

### Вход по email и Telegram (обязательно для облачной истории)

Без этих переменных код на почту **не уходит** (только в логах Railway), Telegram-кнопка **не работает**.

| Variable | Зачем | Пример |
|----------|-------|--------|
| `DATABASE_URL` | **История и аккаунты не пропадают** при редеплое | `${{Postgres.DATABASE_URL}}` — см. ниже про стрелку |
| `RESEND_API_KEY` | API-ключ [resend.com](https://resend.com/api-keys) | `re_...` |
| `RESEND_FROM` | Отправитель (домен верифицирован в Resend) | `Music Story <noreply@твой-домен.ru>` |
| `TELEGRAM_BOT_TOKEN` | Токен бота от @BotFather | `7123456789:AAH...` |
| `TELEGRAM_BOT_USERNAME` | Username бота **без @** | `MusicStoryLoginBot` |

**Postgres — почему нет стрелочки:** Railway рисует связь только если `DATABASE_URL` **ссылка на сервис**, а не руками вставленный URL.

1. Открой карточку **Postgres** → **Connect** → выбери **music-story** → Add reference  
   **или**
2. В Variables у **music-story** удали старый `DATABASE_URL` → **New Variable** → **Add Reference** → Postgres → `DATABASE_URL`

Значение должно быть `${{Postgres.DATABASE_URL}}`, не `postgresql://postgres:...@...`.

**Resend:** зарегистрируй домен в Resend → DNS-записи → потом `RESEND_FROM`. Для теста без домена: `onboarding@resend.dev` (письма только на email аккаунта Resend).

**Telegram Login Widget (как Movie Planner mobile):** в приложении WebView с `baseUrl = TELEGRAM_WIDGET_BASE_URL`. В @BotFather: `/setdomain` → **`efir-ai.ru`**.

| `TELEGRAM_BOT_TOKEN` | Токен от @BotFather |
| `TELEGRAM_BOT_USERNAME` | Username **без @** |
| `TELEGRAM_WIDGET_BASE_URL` | `https://efir-ai.ru` |

После деплоя проверь:
```bash
curl -s https://ТВОЙ-DOMAIN.up.railway.app/health
# В приложении: Настройки → Аккаунт → Email или Telegram
# На новом телефоне — тот же email/TG → история подтянется
```

При первом деплое с Postgres сервер импортирует `accounts.json` / `dev-tier-overrides.json` с тома, если они есть.

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

В production: `{"status":"ok"}`. Локально (без `NODE_ENV=production`): также видны флаги `groq`, `gemini`, `appAuthRequired`.

### Если в логах `npm error signal SIGTERM`

| Причина | Что сделать |
|---------|-------------|
| Старый контейнер при редеплое | Нормально, если новый деплой **Active** и `/health` отвечает |
| `npm start` вместо node | Start Command → `node dist/index.js` |
| Root Directory `backend` + Nixpacks | Переключи на Dockerfile (уже в `backend/railway.toml`) или Root Directory = пусто |
| Нет `dist/` после сборки | В Build Logs должно быть `npm run build` без ошибок |

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
