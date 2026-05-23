# Deploy на Railway (прокси Groq из РФ)

**GitHub:** https://github.com/zapnikita95/music-story

Railway крутит бэкенд **за рубежом** → Groq и Yandex работают, телефон стучится только на Railway.

## 1. Railway + GitHub

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Выбери репозиторий **`zapnikita95/music-story`**
3. **Settings → Root Directory:** `backend`
4. Railway подхватит `railway.toml` и `npm start`

## 2. Variables (Railway → Service → Variables)

| Variable | Значение |
|----------|----------|
| `GROQ_API_KEY` | `gsk_...` |
| `YANDEX_API_KEY` | `AQVN...` |
| `YANDEX_FOLDER_ID` | `b1g0...` (каталог сервисного аккаунта!) |
| `PROXY_SECRET` | любая длинная строка, напр. `music-story-7xK9...` |
| `PORT` | Railway подставит сам — **не трогай** |

## 3. URL

Settings → Networking → **Generate Domain** → скопируй, напр.  
`https://music-story-production.up.railway.app`

Проверка:

```bash
curl https://ТВОЙ-DOMAIN.up.railway.app/health
```

Должно быть `"groq": true`.

## 4. Приложение на телефоне

**Настройки:**

- **URL бэкенда:** `https://ТВОЙ-DOMAIN.up.railway.app`
- **Секрет бэкенда:** тот же `PROXY_SECRET`
- **Groq API ключ:** можно **оставить пустым** — Groq на сервере

**Сохранить.**

## Как это работает

```
Телефон (РФ) → Railway (EU/US) → Groq API ✅
                              → Yandex TTS ✅
```

Прямой вызов `api.groq.com` с телефона/ПК из РФ → 403 (геоблок).
