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

**Telegram Login Widget:** WebView в приложении. Домен **должен открывать страницу**, не парковку Reg.ru.

| `TELEGRAM_WIDGET_BASE_URL` | `https://efir-ai.ru` |

**Reg.ru → Railway (обязательно):**
1. Railway → сервис music-story → **Settings → Networking → Custom Domain** → добавь `efir-ai.ru`
2. Reg.ru → DNS → **CNAME** `@` или `www` → значение из Railway (или A на IP Railway)
3. Убери «парковку» Reg.ru для этого домена
4. Проверка: `curl -s https://efir-ai.ru/` — HTML «Music Story — Telegram», не Reg.ru
5. @BotFather → `/setdomain` → бот → **`efir-ai.ru`**

Можно временно: `TELEGRAM_WIDGET_BASE_URL=https://ТВОЙ-СЕРВИС.up.railway.app` + в BotFather указать **custom domain** Railway (если добавлен в Railway).

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
                              → Yandex TTS ✅ (premium)
                              → Silero TTS ✅ (free tier)
```

## Silero TTS (бесплатный тариф)

На free tier BFF озвучивает через **Silero v5_ru** (если настроен), иначе — Yandex.

### 1. Два сервиса в одном проекте (важно)

| Сервис | Dockerfile | Start | Домен (пример) |
|--------|------------|-------|----------------|
| **neuroradio** (BFF) | корневой `Dockerfile` | `node dist/index.js` | `neuroradio-production.up.railway.app` |
| **silero** (TTS) | **`Dockerfile.silero`** | из образа | `neuroradio-silero.up.railway.app` |

**Не путай URL:** `SILERO_TTS_URL` — это **только** Silero-сервис. Если указать домен BFF (`neuroradio-production…`), `/voices` вернёт 404 и озвучка не заработает.

**Silero-сервис:**
1. В том же Railway-проекте → **+ New** → **GitHub Repo** → тот же репозиторий
2. Settings → **Config-as-code** → File path: **`silero-railway.toml`**  
   (корневой `railway.toml` задаёт BFF Dockerfile — поле Dockerfile в UI **не кликается**, это нормально)
3. У сервиса **silero** убери лишние Variables (GROQ, YANDEX, LLM) — они только на BFF
4. **Generate Domain** на silero → скопируй URL
5. Проверка: `curl https://ТВОЙ-SILERO.up.railway.app/voices` → `aidar`, `baya`, `kseniya`, …

**Связать BFF и Silero (Variables на music-story):**
```
SILERO_TTS_ENABLED=true
TTS_PREFER_SILERO=true
SILERO_TTS_API=legacy
SILERO_TTS_VOICE=baya
SILERO_TTS_URL=https://${{silero.RAILWAY_PUBLIC_DOMAIN}}
```
Reference `${{silero.RAILWAY_PUBLIC_DOMAIN}}` — через **New Variable → Add Reference** → сервис silero.

**Не путай URL:** если `SILERO_TTS_URL` = домен BFF (`neuroradio-production-3966…`), `/health` покажет `sileroTts:false`.

### 2. Variables на BFF (neuroradio)

| Variable | Значение |
|----------|----------|
| `SILERO_TTS_ENABLED` | `true` |
| `TTS_PREFER_SILERO` | `true` |
| `SILERO_TTS_API` | `legacy` |
| `SILERO_TTS_VOICE` | `baya` — **только fallback**, если приложение не передало голос; в APK выбор: baya / aidar / kseniya / eugene |
| `SILERO_TTS_URL` | `https://ТВОЙ-SILERO.up.railway.app` (**не** домен BFF!) |

Локально (Docker): `SILERO_TTS_URL=http://127.0.0.1:8001` — см. `start-silero-tts.bat`.

### 3. Проверка

```powershell
cd backend
.\scripts\test-silero-tts.ps1
```

```bash
curl -s https://ТВОЙ-BFF.up.railway.app/health
# sileroTts: true

curl -s https://ТВОЙ-BFF.up.railway.app/v1/public/tts-config
# silero.healthy: true, presets: [...]
```

В приложении (бесплатный тариф): **Настройки → Озвучка → Silero на сервере** или **Android TTS**, затем выбор амплуа (baya / aidar / kseniya / eugene).

## Оплата и подписка (ЮKassa)

Тарифы: **199 ₽/мес**, **499 ₽/квартал**, **1999 ₽/год** — предоплата на период (не автосписание каждый месяц, как в movie_planner_bot).

### Variables на BFF (music-story)

| Variable | Значение |
|----------|----------|
| `YOOKASSA_SHOP_ID` | Shop ID из кабинета ЮKassa |
| `YOOKASSA_SECRET_KEY` | Секретный ключ |
| `YOOKASSA_RETURN_URL` | `https://www.efir-ai.ru/?payment=success` (или свой) |
| `RESEND_API_KEY` | Resend для писем |
| `RESEND_FROM` | `Эфир AI <hello@efir-ai.ru>` |
| `RECEIPT_ADMIN_EMAIL` | `zap.nikita95@gmail.com` — запрос чека после оплаты |
| `BILLING_ADMIN_SECRET` | Секрет для `POST /v1/billing/admin/receipt` |
| `PUBLIC_BFF_URL` | `https://neuroradio-production-3966.up.railway.app` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — **обязательно**, иначе premium сбросится при редеплое |

**Webhook в ЮKassa:** `https://ТВОЙ-BFF.up.railway.app/v1/public/yookassa/webhook`  
Событие: `payment.succeeded`.

### Как работает в приложении

1. **Аккаунт → Подписка** → email (для активации и чека) → месяц / квартал / год
2. Открывается браузер ЮKassa (`confirmationUrl`)
3. Webhook → `grantPremiumByEmail` → `premiumUntil` +1/3/12 мес
4. Пользователю: письмо «оплата прошла»; админу: письмо «нужен чек» с инструкцией API
5. В приложении **войти тем же email** → tier `premium`, лимиты и Yandex TTS
6. Когда `premiumUntil` истёк → tier снова `free` (доступ забирается автоматически)

**Отправить чек пользователю:**
```bash
curl -X POST https://ТВОЙ-BFF/v1/billing/admin/receipt \
  -H "Content-Type: application/json" \
  -H "x-billing-admin-secret: ВАШ_СЕКРЕТ" \
  -d '{"to":"user@mail.ru","subject":"Чек Эфир AI","text":"…","paymentId":"…"}'
```

Проверка без оплаты:
```powershell
Invoke-RestMethod -Uri "https://ТВОЙ-BFF/v1/public/payment/create" -Method POST -ContentType "application/json" -Body '{"email":"test@example.com","plan":"month"}'
# ok + confirmationUrl (если YOOKASSA_* заданы)
```

Прямой вызов `api.groq.com` с телефона/ПК из РФ → 403 (геоблок).
