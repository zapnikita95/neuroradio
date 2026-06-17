# In-app purchases (USD) — Google Play & App Store

Международная подписка ($3.99 / $9.99 / $39.99) продаётся **только** через встроенные покупки:

| Платформа | Канал | Валюта |
|-----------|--------|--------|
| Android (EN UI) | Google Play Billing | USD (локальная цена в консоли) |
| iOS (EN UI) | App Store (StoreKit) | USD |
| RU UI | YooKassa | ₽ |

Product IDs (одинаковые в Play Console и App Store Connect):

- `premium_month_usd`
- `efir_premium_quarter_usd`
- `efir_premium_year_usd`

---

## 1. Google Play Console

1. [Google Play Console](https://play.google.com/console) → приложение **Эфир AI** (`com.efirai.myapp`).
2. **Monetize → Products → Subscriptions** — создай три подписки с ID выше.
3. Base plan: monthly / 3 months / yearly, цены ~$3.99 / $9.99 / $39.99.
4. **Monetize → Monetization setup** — заполни налоговый профиль и банковский счёт для выплат.
5. **Setup → API access** → создай **Service Account** в Google Cloud, дай роль **Finance** или **View financial data** + доступ к приложению в Play Console.
6. Скачай JSON ключ сервисного аккаунта.

На Railway (BFF):

```env
GOOGLE_PLAY_PACKAGE_NAME=com.efirai.myapp
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}
```

---

## 2. App Store Connect

1. [App Store Connect](https://appstoreconnect.apple.com) → приложение → **Subscriptions**.
2. Subscription Group «Extended» → три auto-renewable с теми же Product ID.
3. **Users and Access → Integrations → In-App Purchase** — Shared Secret для verifyReceipt.

На Railway:

```env
APP_STORE_SHARED_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

(Опционально позже: App Store Server API key `.p8` — для Server Notifications v2.)

---

## 3. Логика языка и подписки

| Подписка | Переключить UI на EN | Переключить UI на RU |
|----------|----------------------|----------------------|
| RU (YooKassa) | ❌ — предложить intl подписку | ✅ |
| intl (Play/App Store) | ✅ | ✅ (лимиты **не** понижаются) |

Лимиты историй зависят от **тарифа** (`premium` = 25/день), не от языка UI.

---

## 4. Как вывести деньги (РФ → друг в Сербии)

### Google Play

1. В Play Console: **Payments profile** — указывается **страна мерчанта** и **банковский счёт** для выплат.
2. Google платит на счёт в **той стране, где зарегистрирован payments profile** (не обязательно РФ).
3. **Вариант для тебя:** друг в Сербии регистрирует **Google Play Developer account** (или ты передаёшь ему ownership приложения / revenue share через договор). Payments profile → **сербский IBAN** (например Banca Intesa, Raiffeisen RS).
4. Выплаты: ежемесячно, порог ~$100 (зависит от страны). Google удерживает **15%** (малый бизнес / первый год) или **30%** комиссию.
5. Деньги приходят на счёт друга в RSD/EUR — он переводит тебе по договорённости (Wise, крипта, нал).

**Важно:** если developer account на **физлицо в РФ**, Google может ограничить выплаты на российские банки. In-app billing из РФ часто проще вести через **аккаунт друга-нерезидента** (Сербия, Армения, Казахстан, UAE).

### Apple App Store

1. **App Store Connect → Agreements, Tax, and Banking** — банковский счёт и налоговая форма (W-8BEN).
2. Apple платит на **IBAN** указанной страны; для Сербии — счёт в банке, поддерживающем SWIFT (EUR/USD).
3. Комиссия Apple: **15%** (Small Business Program, < $1M/год) или **30%**.
4. Выплаты ~45 дней после месяца продаж (net 45).

### Практическая схема с другом в Сербии

1. Друг открывает **ИП или DOO** (опционально, но чище для налогов) + счёт в сербском банке.
2. **Google Play Developer** и/или **Apple Developer Program** ($99/год) на его юрлицо/физлицо.
3. Приложение публикуется с его аккаунта (или ты — admin, он — account holder).
4. Все IAP-поступления → его счёт → перевод тебе по written agreement (50/50, фикс и т.д.).
5. Для **налогов в Сербии** друг консультируется с локальным бухгалтером (доход от зарубежных платформ облагается).

### Что нельзя

- Принимать USD **вне** Play/App Store для тех же цифровых подписок — нарушение правил сторов (и Stripe тебе из РФ всё равно недоступен).
- Обходить блокировку RU→EN подписки — это by design (разные себестоимости моделей).

---

## 5. Тестирование

**Android:** license testers в Play Console → Internal testing track → установка из Play.

**iOS:** Sandbox tester в App Store Connect → TestFlight или Xcode.

**Backend локально:** без ключей verify вернёт 503; для dev можно `POST /v1/billing/activate-admin` с `x-billing-admin-secret`.
