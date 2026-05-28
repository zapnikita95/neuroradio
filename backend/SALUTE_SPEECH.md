# SaluteSpeech (Сбер) — premium TTS для РФ

Работает из России, оплата в рублях через [Studio](https://developers.sber.ru/studio).  
ElevenLabs и Azure для резидентов РФ часто недоступны — **premium по умолчанию = SaluteSpeech**, база = Yandex.

## Где взять API

| Шаг | Ссылка |
|-----|--------|
| Продукт | https://developers.sber.ru/portal/products/smartspeech |
| Быстрый старт (физлица) | https://developers.sber.ru/docs/ru/salutespeech/quick-start/integration-individuals |
| Авторизация (ключ + токен) | https://developers.sber.ru/docs/ru/salutespeech/api/authentication |
| Синхронный синтез | https://developers.sber.ru/docs/ru/salutespeech/guides/synthesis/synthesis-sync |
| REST API | https://developers.sber.ru/docs/ru/salutespeech/rest/salutespeech-rest-api |
| Сертификаты НУЦ (обязательно для Node) | https://developers.sber.ru/docs/ru/salutespeech/quick-start/certificates |
| Примеры голосов | https://developers.sber.ru/docs/ru/salutespeech/guides/synthesis/voices |

## Регистрация (кратко)

1. Войти в **Studio**: https://developers.sber.ru/studio  
2. Создать проект **SaluteSpeech API**.  
3. **Настройки API** → **Получить ключ** → скопировать **Authorization Key** (Base64 от Client ID + Secret).  
4. Для физлица scope: `SALUTE_SPEECH_PERS` (по умолчанию в проекте).

Бесплатный лимит на старте (уточняй на портале): порядка **200 000 символов** и **100 минут** в месяц.

## Переменные Railway / `.env`

```env
# Вариант A — готовый ключ из Studio (рекомендуется)
SALUTE_SPEECH_AUTH_KEY=<Authorization Key из Studio>
SALUTE_SPEECH_SCOPE=SALUTE_SPEECH_PERS
SALUTE_SPEECH_ENABLED=true
SALUTE_SPEECH_VOICE=Pon_24000
SALUTE_SPEECH_FORMAT=opus

# Вариант B — Client ID + Secret отдельно
# SALUTE_SPEECH_CLIENT_ID=
# SALUTE_SPEECH_CLIENT_SECRET=

# Сертификат Минцифры для Node (скачать .cer с госсайта, см. доку)
SALUTE_SPEECH_CA_CERT=/path/to/russian_trusted_root_ca.pem
# или на сервере:
# NODE_EXTRA_CA_CERTS=/path/to/russian_trusted_root_ca.pem
```

### Голоса (24 kHz)

| ID | Описание |
|----|----------|
| `Pon_24000` | Сергей — мужской, разговорный (default radio) |
| `Tur_24000` | Тарас — мужской, авторитетный |
| `May_24000` | Марфа — женский, тёплый |
| `Ost_24000` | Александра — женский, мягкий |
| `Bys_24000` | Борис — мужской, деловой |
| `Nec_24000` | Наталья — женский, чёткий |

## API в приложении

- База: `voice_tier: "default"` → Yandex  
- Premium: `voice_tier: "premium"` + подписка → **SaluteSpeech** (`tts_provider: "auto"` или `"sber"`)

Тест premium без Play Billing:

```http
POST /v1/billing/activate-admin
x-billing-admin-secret: <секрет>
{ "months": 1 }
```

## Стоит ли «заебись»?

Для **чистого русского из РФ** — один из лучших вариантов: native RU, SSML, ударения/нормализация текста, рублёвая оплата.  
Не магия «как в рилсах на английском», но для подкаста/радио-истории — **логичный premium поверх Yandex**.
