# App Store Review — заметки для повторной отправки

## Guideline 3.1.2(c) — подписки: Privacy + EULA

В приложении (вкладка **Subscription** / **Подписка**) должны быть **кликабельные** ссылки:

- Privacy Policy: https://www.efir-ai.ru/docs/privacy.html (RU) / https://www.efir-ai.ru/docs/privacy-en.html (EN)
- Terms of Use (EULA): https://www.efir-ai.ru/docs/terms.html (RU) / https://www.efir-ai.ru/docs/terms-en.html (EN)

На каждом плане: название (Extended · Month / Quarter / Year), длина периода, цена.

### App Store Connect (метаданные, вручную)

1. **App Information → Privacy Policy URL**: `https://www.efir-ai.ru/docs/privacy.html`
2. **Description** (или custom EULA): добавить строку  
   `Terms of Use (EULA): https://www.efir-ai.ru/docs/terms.html`
3. Либо загрузить custom EULA в поле **EULA** в ASC.

### Текст ответа Apple (англ.)

```
Guideline 3.1.2(c): The Subscription screen now includes functional links to our Privacy Policy
(https://www.efir-ai.ru/docs/privacy.html) and Terms of Use (EULA)
(https://www.efir-ai.ru/docs/terms.html). Each auto-renewable plan shows the product title
(Extended · Month / Quarter / Year), subscription length, and price before purchase.

App Store metadata: Privacy Policy URL is set in App Store Connect; Terms of Use (EULA) link
is included in the app description.
```

## Guideline 2.1(b) — In-App Purchases (обязательно перед ревью)

Apple отклоняет, если IAP **не отправлены на ревью** или кнопка «Оформить подписку» падает с ошибкой.

### App Store Connect (вручную)

1. **Agreements, Tax, and Banking** → **Paid Apps Agreement** — статус **Active** (без этого IAP не работают).
2. **Monetization → Subscriptions** → группа **Extended** → три auto-renewable с ID:
   - `premium_month_usd`
   - `efir_premium_quarter_usd`
   - `efir_premium_year_usd`
3. У **каждой** подписки: локализация, цена, **Review screenshot** (скрин экрана «Subscription» в приложении).
4. Статус каждого IAP → **Submit for Review** (вместе с новым билдом).
5. **Users and Access → Integrations → In-App Purchase** — скопировать **Shared Secret** → Railway `APP_STORE_SHARED_SECRET=...` (fallback verifyReceipt).

### Проверка в Sandbox

1. App Store Connect → **Sandbox** → тестовый Apple ID.
2. На устройстве: Настройки → App Store → Sandbox Account.
3. В приложении: профиль → вкладка **Subscription** → «Оформить подписку» — должен открыться sheet Apple Pay, без красной ошибки.

### Текст ответа Apple (англ.)

```
In-App Purchase subscriptions are configured and submitted for review:
- premium_month_usd (Extended · Month)
- efir_premium_quarter_usd (Extended · Quarter)
- efir_premium_year_usd (Extended · Year)

Each product includes the required App Review screenshot (Subscription tab in the app).
Paid Apps Agreement is active.

How to find subscriptions in the app (no login required):
1. Open the app and complete or skip onboarding.
2. On the main screen, tap the profile icon (person circle) in the top-right corner.
   Alternatively: tap the gear icon → Settings → "View plans and subscribe".
3. The Subscription tab opens by default (segment "Subscription" / "Подписка").
4. Choose Month, Quarter, or Year, then tap "Subscribe" / "Оформить подписку".
5. The App Store purchase sheet appears (sandbox IAP).

Sandbox purchase is verified via StoreKit 2 on device.
For full premium without purchase, use demo account appletester@test.ru + OTP 000000.
```

## iPhone only

Приложение **не для iPad** (`TARGETED_DEVICE_FAMILY = 1`). В App Store Connect убедитесь, что в разделе Pricing and Availability / Device Availability iPad **не** отмечен, либо после загрузки билда 97+ iPad исчезнет из списка устройств.

## Guideline 4.8 — Sign in with Apple

На экране входа (иконка профиля → «Войти») первой кнопкой идёт **Sign in with Apple**. Она эквивалентна Telegram/email по функциям аккаунта.

В Developer Portal для `com.efirai.myapp` включите capability **Sign In with Apple** (и ShazamKit в App Services).

## Guideline 2.1 — демо-аккаунт (email)

Это **не пароль**, а двухшаговый вход по коду:

1. Email: `appletester@test.ru`
2. Нажать **«Получить код»**
3. Ввести код: `000000` (шесть нулей)
4. Нажать **«Войти»**

Аккаунт получает Premium на год, 10 историй/день. Письмо не требуется.

Альтернатива: **Sign in with Apple** на том же экране.

## Текст ответа в App Store Connect (англ.)

```
Sign in with Apple is available on the login screen (profile icon → Sign In) as an equivalent login option alongside email OTP and Telegram.

Demo account (email OTP, not password):
1. Enter email: appletester@test.ru
2. Tap "Get code" / «Получить код»
3. Enter OTP: 000000
4. Tap Sign In / «Войти»

The app is iPhone-only (not designed for iPad). Build 97+ targets iPhone only.
```
