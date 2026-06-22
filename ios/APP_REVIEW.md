# App Store Review — free iOS app (build 151+)

Версия **1.5.105 (151+)** — **полностью бесплатное** iOS-приложение.

- Нет In-App Purchase
- Нет подписок и тарифов в UI
- Нет ссылок на оплату на сайте
- Вход в аккаунт — только синхронизация истории в облаке

В App Store Connect для этой версии **не** привязывать IAP к submission.

## Notes for Review (англ.) — копировать в ASC

```
This iOS app is free. There are no in-app purchases and no subscriptions.

Sign-in (profile icon → Sign in) syncs listening history to the cloud across devices.
Demo sign-in: appletester@test.ru, OTP 000000.

The app generates voice stories about the currently playing track (Spotify, Apple Music, Shazam).
```

## Ответ в Resolution Center (англ.)

```
Guideline 3.1.1: We removed all references to external subscription purchase and paid tiers.
This build is a fully free app with no in-app purchases. Sign-in is only for cloud history sync.
There is no paid digital content accessed in the iOS app.

Demo: profile → Sign in → appletester@test.ru, OTP 000000.
```

## Что проверить перед отправкой

1. Профиль → **нет** карточки «Расширенный» / efir-ai.ru
2. Настройки → **нет** секции подписки
3. Notes for Review — **без** «premium on website»
4. IAP **не** в submission

## Когда откроется Paid Apps Agreement

1. Вернуть `IosAppStorePolicy.suppressPaidFeatures = false`
2. Вернуть UI подписки + StoreKit (как build 148–149)
3. Привязать IAP к версии
