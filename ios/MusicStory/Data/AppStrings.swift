import Foundation

/// User-facing copy — keep in sync with `android/app/src/main/res/values/strings.xml`.
enum AppStrings {
    enum OfflinePack {
        static let title = "Офлайн-эфир"
        static let intro = "Соберите 10 разных треков — приложение подготовит для них истории заранее. Потом можно слушать без интернета."
        static let start = "Подготовить офлайн-эфир"
        static let cancel = "Отменить"
        static let refresh = "Собрать новый пакет"
        static let collectingHint = "Включите shuffle или перематывайте треки в плеере. Каждый новый трек добавляется в пакет."
        static let readyHint = "Когда играет трек из пакета, Эфир расскажет сохранённую историю офлайн."
        static let premiumLocked = "Доступно по подписке (или укажи свой API-ключ для ручного режима)"
        static let tierRequiredError = "Офлайн-эфир доступен на расширенном тарифе"

        static func progress(collected: Int, target: Int) -> String {
            "Собрано \(collected) из \(target)"
        }

        static func generating(ready: Int, target: Int) -> String {
            "Готовим истории и факты… \(ready) из \(target)"
        }

        static func ready(count: Int) -> String {
            "Готово! \(count) историй на телефоне — можно слушать без сети."
        }

        static func tracksReadyBody(count: Int) -> String {
            "Готовим \(count) историй в фоне — пришлём уведомление, когда всё будет готово."
        }

        // Notifications — mirror `offline_pack_*` in strings.xml
        static let notifCollectingTitle = "Сбор треков для офлайн-эфира"
        static func notifCollectingBody(collected: Int, target: Int) -> String {
            "\(collected) из \(target)"
        }
        static let notifCollectingHint = "Перематывайте или включите shuffle в музыкальном плеере — нужны разные треки."
        static let notifTracksReadyTitle = "10 треков собраны"
        static func notifTracksReadyBody(count: Int) -> String {
            tracksReadyBody(count: count)
        }
        static let notifGeneratingTitle = "Готовим офлайн-эфир"
        static func notifGeneratingBody(ready: Int, target: Int) -> String {
            "\(ready) из \(target) готово"
        }
        static let notifDoneTitle = "Офлайн-эфир готов"
        static func notifDoneBody(count: Int) -> String {
            "\(count) историй можно слушать без интернета"
        }
        static let notifDoneHint = "Откройте настройки или просто включите трек из пакета — история заиграет офлайн."
        static let notifFailedTitle = "Не удалось подготовить офлайн-эфир"
        static let notifFailedBody = "Проверьте интернет и попробуйте снова в настройках."
    }

    enum History {
        static let listen = "Слушать"
    }

    enum Billing {
        static let navTitle = "Оплата"
        static let title = "Расширенная подписка"
        static let playHint = "Оплата через App Store — встроенная покупка. Управление — Настройки → Apple ID → Подписки."
        static let subscribe = "Оформить подписку"
        static let processing = "…"
        static let success = "Подписка активирована"
    }

    enum Language {
        static let enBlockedTitle = "Нужна международная подписка"
        static let enUpgradeHint =
            "У вас активна подписка в рублях. Английский интерфейс использует более дорогие модели — " +
            "оформите международную подписку через App Store."
        static let enUpgradeCta = "Перейти к оплате"
    }

    enum Onboarding {
        static let title = "Music Story"
        static let iosIntro =
            "На iPhone нет доступа к уведомлениям других приложений, как на Android. " +
            "Мы подключаемся к плеерам напрямую или распознаём звук через Shazam."

        static let appleMusicTitle = "Apple Music"
        static let appleMusicSubtitle = "Подключается автоматически — трек виден на главном экране."

        static let spotifyTitle = "Spotify (опционально)"
        static let spotifySubtitle = "Client ID в настройках — тогда трек и пауза работают сами."

        static let shazamTitle = "Другие плееры (Яндекс, VK и др.)"
        static let shazamSubtitle =
            "Музыка ловится через Shazam: короткое распознавание, затем история по треку."

        static let headphonesTitle = "Наушники"
        static let headphonesSubtitle =
            "AirPods — распознавание прямо из наушников. Обычные наушники — поднесите телефон к источнику звука, как в Shazam."

        static let notificationsTitle = "Уведомления"
        static let notificationsSubtitle = "Кнопка «Рассказать историю» в push о новом треке."

        static let allowNotifications = "Разрешить уведомления"
        static let connectSpotify = "Подключить Spotify"
        static let skip = "Пропустить"
        static let begin = "Начать"
        static let next = "Далее"
    }

    enum Shazam {
        static let micDenied = "Нужен доступ к микрофону. Настройки → Эфир AI → Микрофон."
        static let noMatch = "Трек не распознан. Поднесите телефон к колонке или снимите один наушник на пару секунд."
        static let engineFailure = "Микрофон занят. Остановите запись в других приложениях и попробуйте снова."

        static let autoDetectTitle = "Shazam для других плееров"
        static let autoDetectHint =
            "Когда играет музыка не из Spotify / Apple Music, приложение коротко слушает и узнаёт трек — " +
            "как авто-режим на Android. Не non-stop: ~10 секунд раз в минуту, пока играет плеер."
        static let recognizeButton = "Распознать через Shazam"
        static let listeningHint = "Слушаю… поднесите к колонке"
        static let homeIdleSubtitle =
            "Spotify или Apple Music — сами. Другой плеер — Shazam в настройках или кнопка ниже."
    }
}
