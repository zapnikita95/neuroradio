# App Store Review — заметки для повторной отправки

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
